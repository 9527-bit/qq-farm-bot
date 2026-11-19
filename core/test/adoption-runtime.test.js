const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { runExclusiveAutomationTask } = require('../src/services/automation-lock');
const { runWithOperationContext, assertOperationActive } = require('../src/utils/operation-context');
const { createScheduler } = require('../src/services/scheduler');

test('expired queued writes never start, reentrant work completes and later work recovers', async () => {
    let release;
    const first = runExclusiveAutomationTask('held', () => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    let writes = 0;
    const context = { deadline: Date.now() + 10000, sent: 0 };
    const pending = runWithOperationContext(context, () => runExclusiveAutomationTask('write', () => writes++));
    context.cancelled = true;
    const rejected = assert.rejects(pending, { code: 'OPERATION_EXPIRED' });
    release();
    await Promise.all([first, rejected]);
    assert.equal(writes, 0);
    await runExclusiveAutomationTask('outer', () => runExclusiveAutomationTask('inner', () => writes++));
    assert.equal(writes, 1);
});

test('timer callbacks drop the finished API deadline and cannot reenter a held scene lock', async t => {
    const scheduler = createScheduler('ranch-test');
    t.after(() => scheduler.dispose());
    let release;
    let started;
    const entered = new Promise(resolve => { started = resolve; });
    const calls = [];
    const held = runExclusiveAutomationTask('held', async () => {
        runWithOperationContext({ deadline: 0 }, () => scheduler.setTimeoutTask('nested', 0, () => { assertOperationActive(); calls.push('timer'); }));
        started();
        await new Promise(resolve => { release = resolve; });
        calls.push('released');
    });
    await entered;
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.deepEqual(calls, []);
    release(); await held;
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.deepEqual(calls, ['released', 'timer']);
});

test('parent RPC sends deadline and cancels the matching worker request after timeout', async t => {
    const { createWorkerManager } = require('../src/runtime/worker-manager');
    const proc = new EventEmitter();
    const messages = [];
    proc.send = message => messages.push(message);
    proc.kill = () => {};
    const manager = createWorkerManager({ fork: () => proc, runtimeMode: 'fork', processRef: { env: {} },
        mainEntryPath: '', workerScriptPath: '', workers: {}, globalLogs: [], log() {}, addAccountLog() {},
        normalizeStatusForPanel: value => value, buildConfigSnapshotForAccount: () => ({}),
        getOfflineAutoDeleteMs: () => Infinity, triggerOfflineReminder() {}, addOrUpdateAccount() {},
        getAccounts: () => ({ accounts: [] }), deleteAccount() {} });
    t.after(() => manager.dispose());
    manager.startWorker({ id: 'synthetic', name: 'fixture', code: 'synthetic' });
    await assert.rejects(manager.callWorkerApi('synthetic', 'operateRanch', 'buy', {}, { _timeoutMs: 10 }), /API Timeout/);
    const call = messages.find(message => message.type === 'api_call');
    assert.ok(Number.isFinite(call.deadline));
    assert.ok(messages.some(message => message.type === 'api_cancel' && message.id === call.id));
});

test('both versioned upstream WASM files initialize and round-trip independently offline', async () => {
    const { TsdkRuntime } = require('../src/utils/tsdk-adoption-runtime');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-wasm-'));
    try {
        for (const platform of ['qq', 'wx']) {
            const runtime = new TsdkRuntime({ platform, dataDir: path.join(dir, platform), accountId: 'synthetic' });
            await runtime.init();
            const plain = Buffer.from('offline-adoption-fixture');
            assert.deepEqual(runtime.decrypt(runtime.encrypt(plain)), plain);
            assert.equal(runtime.getStatus().platform, platform);
            runtime.destroy();
            assert.throws(() => runtime.encrypt(plain));
        }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('scene switching restores the farm after failures even when the operation expires', async () => {
    const file = path.resolve(__dirname, '../src/services/ranch/transport.js');
    const realRequire = createRequire(file);
    const calls = [];
    const state = { unlockedSceneIds: [1, 2], globalSceneId: 1 };
    const socket = {};
    const network = { getUserState: () => state, getWs: () => socket, invalidateGameScene() { calls.push('invalid'); },
        async loginGameScene(id) { assertOperationActive(); calls.push(id); state.globalSceneId = id; return { big_farm_scene_ext_data: Buffer.alloc(0) }; } };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, Date,
        require: id => id === '../../utils/network' ? network : id === '../../utils/adoption-proto' ? { types: { RanchSceneData: { decode: () => ({ homestead_cells: {} }) } } } : realRequire(id),
    }, { filename: file });
    const context = { deadline: Date.now() + 10000 };
    await assert.rejects(runWithOperationContext(context, () => module.exports.inScene(async () => { context.cancelled = true; throw new Error('fixture failure'); })), /fixture failure/);
    assert.deepEqual(calls, [2, 1]);
    assert.equal(state.globalSceneId, 1);
});

test('modern login selects the platform channel and waits for a valid farm scene before automation', async () => {
    await require('../src/utils/proto').loadProto();
    const file = path.resolve(__dirname, '../src/utils/network.js');
    const realRequire = createRequire(file);
    const { types } = require('../src/utils/adoption-proto');
    const { CONFIG } = require('../src/config/config');
    const saved = { platform: CONFIG.platform, clientVersion: CONFIG.clientVersion };
    try {
        for (const platform of ['qq', 'wx']) {
            for (const valid of [true, false]) {
                CONFIG.platform = platform;
                CONFIG.clientVersion = '1.17.0.4_20261117';
                const module = { exports: {} };
                const steps = [];
                const sandbox = { module, exports: module.exports, require: realRequire, Buffer, console, Date, steps,
                    loginBody: types.PlayerLoginReply.encode(types.PlayerLoginReply.fromObject({ basic: { gid: 1, name: 'synthetic', open_id: 'synthetic' }, unlocked_scene_ids: [1, 2] })).finish(),
                    sceneBody: types.PlayerSceneLoginReply.encode({ global_scene_id: 1, farm_scene_ext_data: valid ? Buffer.from([8, 1]) : Buffer.alloc(0) }).finish(),
                };
                vm.runInNewContext(fs.readFileSync(file, 'utf8') + `
                    module.exports.testRun = async () => {
                        ws = { readyState: 1 };
                        startHeartbeat = () => steps.push('heartbeat');
                        startAceService = () => steps.push('ace');
                        invalidateGameScene = () => steps.push('invalid');
                        sendMsg = async (service, method, body, callback) => {
                            steps.push(method);
                            module.exports.request = body;
                            await callback(null, loginBody);
                        };
                        sendMsgAsync = async (_service, method) => { steps.push(method); return { body: sceneBody }; };
                        await sendLogin(() => steps.push('ready'));
                    };`, sandbox, { filename: file });
                await module.exports.testRun();
                assert.equal(steps[0], 'PlayerLogin');
                assert.ok(steps.includes('PlayerSceneLogin'));
                assert.equal(steps.includes('ready'), valid);
                assert.equal(steps.includes('invalid'), !valid);
                const request = types.PlayerLoginRequest.decode(module.exports.request);
                assert.equal(request.report_data.minigame_channel, platform === 'wx' ? 'other' : 'other-qq');
                assert.equal(request.game_scene_id, 1);
            }
        }
    } finally { Object.assign(CONFIG, saved); }
});
