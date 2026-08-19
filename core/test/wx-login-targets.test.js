const test = require('node:test');
const assert = require('node:assert/strict');

const { targets } = require('../src/services/wx-login/native-protocol');

test('targets("long") 返回有效的目标 IP 与端口列表', async () => {
  const list = await targets('long');
  assert.ok(Array.isArray(list) && list.length > 0, '目标列表不能为空');
  for (const item of list) {
    assert.ok(typeof item.ip === 'string' && item.ip.length > 0, 'IP 格式不正确');
    assert.ok(typeof item.port === 'number' && item.port > 0, 'Port 格式不正确');
  }
});

test('targets("short") 返回有效的目标 IP 与端口列表', async () => {
  const list = await targets('short');
  assert.ok(Array.isArray(list) && list.length > 0, '目标列表不能为空');
  for (const item of list) {
    assert.ok(typeof item.ip === 'string' && item.ip.length > 0, 'IP 格式不正确');
    assert.ok(typeof item.port === 'number' && item.port > 0, 'Port 格式不正确');
  }
});

test('当 HTTPDNS 请求异常时 targets 能优雅降级到内置目标而不会抛出 fetch failed 异常', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => {
      const err = new TypeError('fetch failed');
      err.cause = new Error('getaddrinfo ENOTFOUND aedns.weixin.qq.com');
      throw err;
    };

    const longList = await targets('long');
    assert.ok(Array.isArray(longList) && longList.length > 0, 'long 降级列表不能为空');

    const shortList = await targets('short');
    assert.ok(Array.isArray(shortList) && shortList.length > 0, 'short 降级列表不能为空');
  }
  finally {
    global.fetch = originalFetch;
  }
});
