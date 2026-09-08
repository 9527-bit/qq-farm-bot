const assert = require('node:assert/strict');
const test = require('node:test');

function json(payload) {
  return { ok: true, status: 200, async text() { return JSON.stringify(payload); } };
}

test('NapCat login stays disabled unless explicitly enabled', () => {
  process.env.NAPCAT_LOGIN_ENABLED = 'false';
  delete require.cache[require.resolve('../src/services/napcat-login')];
  const service = require('../src/services/napcat-login');
  assert.equal(service.isConfigured(), false);
});

test('NapCat QR flow obtains code, logs out, and enforces task ownership', async (t) => {
  Object.assign(process.env, {
    NAPCAT_LOGIN_ENABLED: 'true',
    NAPCAT_TOKEN: 'napcat-test-token',
    NAPCAT_WEBUI_URL: 'http://napcat.test/api',
    NAPCAT_OPENAUTH_URL: 'http://napcat.test/plugin',
  });
  const originalFetch = globalThis.fetch;
  const calls = [];
  let pluginStatusChecks = 0;
  let loginStatusChecks = 0;
  let loggedOut = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/login')) return json({ code: 0, data: { Credential: 'credential' } });
    if (String(url).endsWith('/status')) return json({ ok: true, ready: ++pluginStatusChecks > 1 });
    if (String(url).endsWith('/QQLogin/GetQQLoginQrcode')) return json({ code: 0, data: { qrcode: 'https://example.test/qr' } });
    if (String(url).endsWith('/QQLogin/GetQQLoginInfo')) return json({ code: 0, data: { uin: '12345', nickname: '测试昵称' } });
    if (String(url).endsWith('/QQLogin/CheckLoginStatus')) {
      loginStatusChecks += 1;
      return json({ code: 0, status: 'success', data: { isLogin: !loggedOut && loginStatusChecks > 1 } });
    }
    if (String(url).endsWith('/miniapp')) return json({ ok: true, operation: 'loginWithAppId', code: 'farm-code', uin: '12345', nickname: '插件昵称' });
    if (String(url).endsWith('/logout')) {
      loggedOut = true;
      return json({ ok: true, loggedOut: true });
    }
    return json({ code: 0 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  delete require.cache[require.resolve('../src/services/napcat-login')];
  const service = require('../src/services/napcat-login');
  const task = await service.create('alice');
  assert.match(task.qrImage, /^data:image\/png;base64,/);
  assert.equal(calls.some(call => call.url.endsWith('/QQLogin/RefreshQRcode')), false);
  await assert.rejects(() => service.status(task.taskId, 'bob'), /不存在或已过期/);
  assert.equal((await service.status(task.taskId, 'alice')).status, 'waiting_scan');
  assert.equal((await service.status(task.taskId, 'alice')).status, 'confirmed');
  assert.deepEqual(await service.code(task.taskId, 'alice'), { code: 'farm-code', uin: '12345', nickname: '插件昵称' });
  assert.equal(pluginStatusChecks, 2);
  assert.ok(calls.some(call => call.url.endsWith('/logout')));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(calls.some(call => call.url.endsWith('/QQLogin/RestartNapCat')), false);

  const refreshed = await service.create('alice', { refresh: true });
  assert.ok(calls.some(call => call.url.endsWith('/QQLogin/RefreshQRcode')));
  await service.cancel(refreshed.taskId, 'alice');
});
