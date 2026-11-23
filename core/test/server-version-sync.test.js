const assert = require('node:assert/strict');
const test = require('node:test');

const { CONFIG } = require('../src/config/config');
const { getClientVersion, setClientVersionForPlatform } = require('../src/utils/client-profile');
const { extractServerClientVersion, buildHeartbeatBody } = require('../src/utils/network');
const { types, loadProto } = require('../src/utils/proto');
const { syncGatewayClientVersion } = require('../src/controllers/admin-account-routes');

test('server version sync prefers forced version over recommended version', () => {
  assert.equal(extractServerClientVersion({
    version_force: '1.14.0.2_20260819',
    version_recommend: '1.14.0.1_20260818',
  }), '1.14.0.2_20260819');
});

test('server version sync accepts recommended version and rejects malformed values', () => {
  assert.equal(extractServerClientVersion({
    version_recommend: '1.14.0.1_20260819',
  }), '1.14.0.1_20260819');
  assert.equal(extractServerClientVersion({ version_force: 'latest' }), '');
  assert.equal(extractServerClientVersion({ version_force: '1.14.0.1_../../secret' }), '');
});

test('QQ and WeChat client versions stay isolated across profile, heartbeat, and gateway sync', async () => {
  await loadProto();
  const saved = {
    platform: CONFIG.platform,
    clientVersion: CONFIG.clientVersion,
    wxClientVersion: CONFIG.wxClientVersion,
  };
  try {
    setClientVersionForPlatform('1.17.1.0_20261120', 'qq');
    setClientVersionForPlatform('1.17.2.0_20261122', 'wx');
    assert.equal(getClientVersion('qq'), '1.17.1.0_20261120');
    assert.equal(getClientVersion('wx'), '1.17.2.0_20261122');

    CONFIG.platform = 'wx';
    const wxHeartbeat = types.HeartbeatRequest.decode(buildHeartbeatBody(1001));
    assert.equal(wxHeartbeat.client_version, '1.17.2.0_20261122');

    CONFIG.platform = 'qq';
    const qqHeartbeat = types.HeartbeatRequest.decode(buildHeartbeatBody(1001));
    assert.equal(qqHeartbeat.client_version, '1.17.1.0_20261120');

    let persisted = { clientVersion: '1.17.1.0_20261120', wxClientVersion: '1.17.2.0_20261122' };
    const store = {
      getSystemConfig: () => persisted,
      setSystemConfig: next => (persisted = next),
    };
    assert.equal(syncGatewayClientVersion({ clientVersion: '1.17.3.0_20261123' }, store, null, 'wx'), true);
    assert.equal(persisted.wxClientVersion, '1.17.3.0_20261123');
    assert.equal(persisted.clientVersion, '1.17.1.0_20261120');
  } finally {
    Object.assign(CONFIG, saved);
  }
});
