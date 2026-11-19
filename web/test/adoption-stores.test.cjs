const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createPinia, setActivePinia, disposePinia } = require('pinia');
const { reactive } = require('vue');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(t, name, api) {
  const pinia = createPinia();
  setActivePinia(pinia);
  t.after(() => disposePinia(pinia));
  const account = reactive({ currentAccountId: 'a' });
  const source = fs.readFileSync(path.join(__dirname, '../src/stores', name + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const imports = { '@/api': { __esModule: true, default: api }, './account': { useAccountStore: () => account }, './toast': { useToastStore: () => ({ success() {} }) } };
  new Function('require', 'module', 'exports', js)(id => imports[id] || require(id), module, module.exports);
  return { account, store: module.exports[name === 'ranch' ? 'useRanchStore' : 'useMugeStore'](pinia) };
}

test('ranch delayed results cannot overwrite another account, concurrent loads coalesce', async t => {
  const requests = [];
  const h = harness(t, 'ranch', { get: (_url, opts) => { const d = deferred(); requests.push({ d, id: opts.headers['x-account-id'] }); return d.promise; } });
  const a = h.store.load({ view: 'animals' });
  await h.store.load({ view: 'animals' });
  assert.equal(requests.length, 1);
  h.account.currentAccountId = 'b';
  const b = h.store.load({ view: 'bag' });
  requests[0].d.resolve({ data: { ok: true, data: { account: 'a' } } });
  await a;
  assert.equal(h.store.state, null);
  assert.equal(h.store.loading, true);
  requests[1].d.resolve({ data: { ok: true, data: { account: 'b' } } });
  await b;
  assert.equal(h.store.state.account, 'b');
  assert.deepEqual(requests.map(r => r.id), ['a', 'b']);
});

test('ranch mutation failures lock resubmission until refreshed and duplicate clicks do not post twice', async t => {
  let writes = 0;
  const pending = deferred();
  const h = harness(t, 'ranch', { get: async () => ({ data: { ok: true, data: { unlocked: true } } }), post: () => { writes++; return pending.promise; } });
  await h.store.load();
  const first = h.store.execute('buy', {});
  assert.equal(await h.store.execute('buy', {}), false);
  pending.reject(new Error('timeout'));
  await first;
  assert.equal(h.store.uncertain, true);
  assert.equal(await h.store.execute('buy', {}), false);
  assert.equal(writes, 1);
  await h.store.load();
  assert.equal(h.store.uncertain, false);
});

test('Muge stale actions do not replace new-account data and end-time blocks sending', async t => {
  const pending = deferred();
  let writes = 0;
  const h = harness(t, 'muge', { get: async () => ({ data: { ok: true, data: { active: true, startTime: Date.now() - 100, endTime: Date.now() + 60000, serverTime: Date.now() } } }), post: () => { writes++; return pending.promise; } });
  await h.store.request();
  const old = h.store.request('claimTask');
  h.account.currentAccountId = 'b';
  await h.store.request();
  pending.resolve({ data: { ok: true, data: { activity: { account: 'a' } } } });
  await old;
  assert.equal(h.store.state.account, undefined);
  h.store.state.endTime = Date.now() - 1;
  assert.equal(await h.store.request('claimTask'), false);
  assert.equal(writes, 1);
});

test('Muge post-success refresh failure retains the state but requires a fresh read before another action', async t => {
  const h = harness(t, 'muge', {
    get: async () => ({ data: { ok: true, data: { active: true, endTime: Date.now() + 60000, serverTime: Date.now() } } }),
    post: async () => ({ data: { ok: true, data: { activity: null, rewards: [], refreshRequired: true } } }),
  });
  await h.store.request();
  assert.equal(await h.store.request('claimTask'), true);
  assert.equal(h.store.needsRefresh, true);
  assert.equal(h.store.state.active, true);
  assert.equal(await h.store.request('claimTask'), false);
  await h.store.request();
  assert.equal(h.store.needsRefresh, false);
});
