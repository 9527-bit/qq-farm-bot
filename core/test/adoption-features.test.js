const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
require.cache[require.resolve('../src/services/logger')] = { exports: { createModuleLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }), sanitizeMeta: value => value } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-features-'));
process.env.FARM_DATA_DIR = dir;
process.env.FARM_ACCOUNT_ID = 'synthetic';
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const { types, loadAdoptionProto } = require('../src/utils/adoption-proto');
test.before(loadAdoptionProto);

function load(relative, overrides = {}) {
    const file = path.resolve(__dirname, '../src', relative);
    const realRequire = createRequire(file);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, Buffer, console, Date, process,
        require: name => Object.hasOwn(overrides, name) ? overrides[name] : realRequire(name),
    }, { filename: file });
    return module.exports;
}

test('every adoption endpoint enforces the local account ownership check', async () => {
    const routes = [];
    let calls = 0;
    require('../src/controllers/admin-adoption-routes').registerAdminAdoptionRoutes({
        app: { get: (path, fn) => routes.push(fn), post: (path, fn) => routes.push(fn) },
        provider: new Proxy({}, { get: () => () => { calls++; } }),
        getAccountIdFromRequest: req => req.accountId,
        canAccessAccount: (req, id) => req.owner === id,
        sendProviderError: () => assert.fail('Should reject before provider'),
    });
    for (const handler of routes) {
        let status;
        const res = { status(value) { status = value; return this; }, json() {} };
        await handler({ accountId: 'bob', owner: 'alice' }, res);
        assert.equal(status, 403);
        await handler({ accountId: '', owner: 'alice' }, res);
        assert.equal(status, 400);
    }
    assert.equal(calls, 0);
});

test('Muge request encoding retains the pinned upstream field numbers (not a live capture)', () => {
    const request = types.MugeOperateRequest.fromObject({ id: '2026111704', cmd: 82, task_claim: { task_id: 1 } });
    const encoded = Buffer.from(types.MugeOperateRequest.encode(request).finish());
    // Field 182 (wire 2), nested task_id (field 1).
    assert.ok(encoded.toString('hex').endsWith('b20b020801'));
    const decoded = types.MugeOperateRequest.decode(encoded);
    assert.equal(decoded.id.toString(), '2026111704');
    assert.equal(decoded.task_claim.task_id.toString(), '1');
});

test('Muge snapshots parse real service shapes; ended/incomplete/invalid actions do not write', async () => {
    let now = 2000;
    let status = 1;
    let writes = 0;
    const snapshot = () => types.MugeListReply.encode(types.MugeListReply.fromObject({ groups: [{
        head: { id: '2026111700', start_time: 1000, end_time: 3000, status },
        children: [{ head: { id: '2026111704' }, task: { tier_points: 10, tiers: [], tasks: [{ task_id: 1, progress: 1, target: 2, status: 1, reward: [], unlock_day: 1, desc: 'fixture' }] } },
            { head: { id: '2026111705' }, survey: { answers: {} } }],
    }] })).finish();
    const service = load('services/activity-muge.js', {
        '../utils/network': { sendMsgAsync: async (_service, method) => { if (method === 'Operate') writes++; return { body: snapshot() }; } },
        '../utils/utils': { getServerTimeSec: () => now, toNum: Number, logWarn() {} },
    });
    const state = await service.getMugeActivity();
    assert.equal(state.active, true);
    assert.equal(state.handbook.tasks[0].target, 2);
    await assert.rejects(service.operateMugeActivity('claimTask'), { code: 'MUGE_NOT_CLAIMABLE' });
    await assert.rejects(service.operateMugeActivity('saveAnswers', { answers: { 1: 999 } }), { code: 'INVALID_MUGE_ANSWERS' });
    now = 3000;
    await assert.rejects(service.operateMugeActivity('claimTask'), { code: 'MUGE_ENDED' });
    now = 999;
    assert.equal((await service.getMugeActivity()).active, false);
    now = 2000; status = 2;
    assert.equal((await service.getMugeActivity()).active, false);
    assert.equal(writes, 0);
});

test('Muge successful claims preserve rewards when the following refresh fails', async () => {
    let calls = 0;
    const service = load('services/activity-muge.js', {
        '../utils/network': { sendMsgAsync: async (_service, method) => {
            calls++;
            if (calls === 3) throw new Error('refresh failed');
            const value = method === 'List' ? { groups: [{ head: { id: '2026111700', start_time: 1000, end_time: 3000, status: 1 }, children: [{ head: { id: '2026111702' }, global_count: { total: 100, tiers: [{ tier_id: 1, threshold: 10, status: 2, reward: [{ id: 7001, count: 2 }] }] } }] }] }
                : { id: '2026111702', cmd: 85, activity: { head: { id: '2026111702' } }, global_count_claim_tier: { claimed_ids: [1], awards: [{ id: 7001, count: 2 }] } };
            const type = method === 'List' ? types.MugeListReply : types.MugeOperateReply;
            return { body: type.encode(type.fromObject(value)).finish() };
        } }, '../utils/utils': { getServerTimeSec: () => 2000, toNum: Number, logWarn() {} },
    });
    const result = await service.operateMugeActivity('claimCelebration');
    assert.equal(result.refreshRequired, true);
    assert.equal(result.rewards[0].count, 2);
});

test('Muge missing/invalid times fail closed and expired enabled settings persist off', () => {
    const windows = require('../src/models/adoption-activity-window');
    assert.equal(windows.isActive(null), false);
    assert.equal(windows.isActive({ startMs: 0, endMs: 10, status: 1 }, 5), false);
    const now = Date.now();
    windows.recordWindow({ startMs: now - 1000, endMs: now + 100000, status: 1 });
    const window = windows.readWindow();
    assert.equal(windows.isActive(window, window.startMs - 1), false);
    assert.equal(windows.isActive(window, window.startMs), true);
    assert.equal(windows.isActive(window, window.endMs - 1), true);
    assert.equal(windows.isActive(window, window.endMs), false);
    const store = require('../src/models/store');
    store.applyConfigSnapshot({ automation: { muge_task_claim: true, ranch_harvest: true } }, { accountId: 'synthetic' });
    assert.equal(store.getAutomation('synthetic').muge_task_claim, true);
    store.persistInactiveActivityAutomation(Math.ceil(window.endMs / 1000));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'store.json')));
    assert.equal(saved.accountConfigs.synthetic.automation.muge_task_claim, false);
    assert.equal(saved.accountConfigs.synthetic.automation.ranch_harvest, true);
    assert.throws(() => store.setAutomation('ranch_check_minutes', 0, 'synthetic'));
});

test('ranch query distinguishes locked state and wrong-scene inventory without using real service', async () => {
    let unlocked = false;
    const service = load('services/ranch/state.js', {
        './transport': { isUnlocked: () => unlocked, inScene: run => run({ facilities: [] }), rpc: async () => ({ global_scene_id: 1, physical_items: [], virtual_items: [] }) },
        '../../utils/network': { isSceneLoginVersion: () => true },
    });
    assert.equal((await service.getState()).unlocked, false);
    unlocked = true;
    await assert.rejects(service.getState(), { code: 'RANCH_RESPONSE_MISMATCH' });
});

test('ranch paid purchases are rejected before balance RPC and cannot bypass shared action validation', async () => {
    let balanceCalls = 0;
    let writes = 0;
    const raw = { cells: { facilities: [] }, bag: { physical_items: [], virtual_items: [] } };
    const state = {
        loadRaw: async () => raw,
        catalog: async () => ({ shopId: 5, goods: [{ id: '1', available: true, maxCount: 10, remaining: 5, reward: { id: 7001, count: '1' }, price: { id: 1004, count: '1' } }] }),
        resourceBalance: async () => { balanceCalls++; return { total: '10', locked: '0' }; },
    };
    const actions = load('services/ranch/actions.js', { './transport': { inScene: run => run(), rpc: () => writes++ }, './state': state });
    await assert.rejects(actions.prepareAction('buy', { shopId: 5, goodsId: '1', count: 1 }), { code: 'PAID_RESOURCE_DENIED' });
    await assert.rejects(actions.operate('buy', { shopId: 5, goodsId: '1', count: 1, expected: { signature: 'invented' } }), { code: 'PAID_RESOURCE_DENIED' });
    assert.equal(balanceCalls, 0);
    assert.equal(writes, 0);
});

test('Muge copied assets exist and match the pinned source manifest', () => {
    const manifest = require('../src/activity-data/muge-assets.json');
    for (const entry of manifest.filter(row => row.file.startsWith('muge/'))) {
        const file = path.resolve(__dirname, '../../web/public/activity', entry.file);
        assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), entry.sha256, entry.file);
    }
    const images = require('../src/gameConfig/ranch/images.json');
    for (const image of Object.values(images)) assert.ok(fs.existsSync(path.resolve(__dirname, '../../web/public', image.slice(1))));
});

test('ranch purchase quotes reject changed offers, limits and low balances before writes', async () => {
    let price = '3';
    let total = '20';
    let writes = 0;
    const raw = { cells: { facilities: [] }, bag: { physical_items: [], virtual_items: [] } };
    const actions = load('services/ranch/actions.js', {
        './transport': { inScene: run => run(), rpc: async () => {
            writes++;
            return { goods: { id: '1' }, cost_items: [{ id: 1007, count: price }], get_items: [{ id: 7001, count: 1 }] };
        } },
        './state': { loadRaw: async () => raw, snapshot: () => ({ unlocked: true }),
            catalog: async () => ({ shopId: 6, goods: [{ id: '1', available: true, maxCount: 5, remaining: 2, reward: { id: 7001, count: '1' }, price: { id: 1007, count: price } }] }),
            resourceBalance: async () => ({ total, locked: '0', state: 'known', resourceKey: 'item:1007' }),
        },
    });
    const input = { shopId: 6, goodsId: '1', count: 1 };
    const quote = await actions.prepareAction('buy', input);
    price = '4';
    await assert.rejects(actions.operate('buy', { ...input, expected: quote.expected }), { code: 'RANCH_OFFER_CHANGED' });
    await assert.rejects(actions.prepareAction('buy', { ...input, count: 3 }), { code: 'PURCHASE_LIMIT_EXCEEDED' });
    total = '0';
    await assert.rejects(actions.prepareAction('buy', input), { code: 'INSUFFICIENT_BALANCE' });
    assert.equal(writes, 0);
    total = '20';
    const next = await actions.prepareAction('buy', input);
    const result = await actions.operate('buy', { ...input, expected: next.expected });
    assert.equal(result.status, 'confirmed');
    assert.equal(writes, 1);
});

test('unknown ranch write outcomes retain reservations across module reload and block repeats', async () => {
    const state = require('../src/services/ranch/operation-state').forCurrentAccount();
    const plan = { target: 'synthetic-unknown', label: 'fixture', costs: [{ resourceKey: 'item:1007', amount: '2' }], balances: [{ resourceKey: 'item:1007', total: '10', locked: '0', state: 'known' }] };
    await assert.rejects(state.spend(plan, async () => {
        require('../src/services/ranch/context').getAmbientSendContext().onSent('fixture', 'Write');
        throw new Error('synthetic timeout');
    }), /synthetic timeout/);
    assert.equal(state.reserved('item:1007'), '2');
    const reloaded = load('services/ranch/operation-state.js').forCurrentAccount();
    await assert.rejects(reloaded.spend(plan, () => assert.fail('must not replay')), { code: 'PENDING_CONFIRMATION' });
    reloaded.acknowledge(reloaded.pending()[0].id);
    assert.equal(reloaded.reserved('item:1007'), '0');
});

test('new automation switches default off; illustrated-only and currency-only schedules can run', () => {
    const defaults = require('../src/config/ranch-automation').RANCH_AUTOMATION_DEFAULTS;
    assert.ok(Object.entries(defaults).filter(([, value]) => typeof value === 'boolean').every(([, value]) => value === false));
    for (const key of ['ranch_illustrated', 'ranch_market_organic_poop', 'ranch_market_organic_pinecone']) {
        const auto = { ...defaults, [key]: true };
        const service = load('services/ranch/automation.js', {
            '../../models/store': { getAutomation: () => auto, getFriendBlacklist: () => [] },
            './transport': { isUnlocked: () => true },
        });
        assert.equal(service.getRoutineState().doneToday, false, key);
    }
});
