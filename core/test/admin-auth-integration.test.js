const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');

test('restored administration preserves users and enforces HTTP access boundaries', { timeout: 30000 }, async (context) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-auth-integration-'));
  const password = 'LocalTest-Password42';
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  const users = ['admin', 'alice', 'bob'].map(username => ({
    username,
    password: passwordHash,
    role: username === 'admin' ? 'admin' : 'user',
    accountLimit: 3,
    createdAt: 123456789,
    card: { enabled: true, expiresAt: Date.now() + 86400000 },
  }));
  const userFile = path.join(dataDir, 'users.json');
  const initialData = JSON.stringify({ users });
  fs.writeFileSync(userFile, initialData);
  const child = fork(path.join(__dirname, 'fixtures/admin-auth-server.js'), [], {
    env: { ...process.env, FARM_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const { port } = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Admin server startup timed out: ${output}`)), 10000);
    child.once('message', message => { clearTimeout(timer); resolve(message); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Admin server exited: ${output}`)); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  async function request(route, { token, body, accountId } = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
        ...(accountId ? { 'x-account-id': accountId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(text)
      : { text };
    return { status: response.status, data };
  }
  async function login(username, suppliedPassword = password) {
    return request('/api/login', { body: { username, password: suppliedPassword } });
  }

  await context.test('startup preserves existing user records; health is public but management is not', async () => {
    assert.equal(fs.readFileSync(userFile, 'utf8'), initialData);
    assert.equal((await request('/api/health')).status, 200);
    assert.equal((await request('/api/accounts')).status, 401);
    assert.equal((await request('/api/admin/users')).status, 401);
    assert.equal((await request('/api/auto-login', { body: {} })).status, 401);
    assert.equal((await login('admin', 'wrong-password')).data.ok, false);
  });

  const adminLogin = await login('admin');
  const aliceLogin = await login('alice');
  assert.equal(adminLogin.data.ok, true, JSON.stringify(adminLogin));
  assert.equal(aliceLogin.data.ok, true, JSON.stringify(aliceLogin));
  const adminToken = adminLogin.data.data.token;
  const aliceToken = aliceLogin.data.data.token;

  await context.test('database credentials and roles work, including legacy password hashes', async () => {
    const currentUser = await request('/api/user/me', { token: aliceToken });
    assert.equal(currentUser.data.data.username, 'alice');
    assert.equal(currentUser.data.data.role, 'user');
    const savedUsers = JSON.parse(fs.readFileSync(userFile, 'utf8')).users;
    assert.equal(savedUsers.length, 3);
    assert.equal(savedUsers.find(user => user.username === 'alice').createdAt, 123456789);
    assert.match(savedUsers.find(user => user.username === 'alice').password, /:/);
  });

  await context.test('ordinary users cannot access management or another farm, including new pet routes', async () => {
    const ownAccounts = await request('/api/accounts', { token: aliceToken });
    assert.deepEqual(ownAccounts.data.data.accounts.map(account => account.id), ['alice-farm']);
    for (const route of ['/api/admin/users', '/api/admin/system-config', '/api/super-admin/anti-resale-config']) {
      assert.equal((await request(route, { token: aliceToken })).status, 403, route);
    }
    assert.equal((await request('/api/dog/info', { token: aliceToken, accountId: 'bob-farm' })).status, 403);
    assert.equal((await request('/api/dog/info', { token: aliceToken, accountId: 'alice-farm' })).status, 200);
  });

  await context.test('admin management endpoints are registered and authenticated auto-login is absent', async () => {
    for (const route of ['/api/admin/users', '/api/admin/users-with-password', '/api/admin/system-config', '/api/super-admin/anti-resale-config', '/api/admin/wx-config']) {
      const response = await request(route, { token: adminToken });
      assert.equal(response.status, 200, `${route}: ${JSON.stringify(response)}`);
      assert.equal(response.data.ok, true);
      assert.equal(JSON.stringify(response.data).includes(passwordHash), false);
    }
    assert.equal((await request('/api/auto-login', { token: adminToken, body: {} })).status, 404);
    const missingConfirmation = await request('/api/super-admin/clear-data', { token: adminToken, body: {} });
    assert.equal(missingConfirmation.status, 400);
    assert.equal(JSON.parse(fs.readFileSync(userFile, 'utf8')).users.length, 3);
  });

  await context.test('password changes persist and logout revokes the session', async () => {
    const newPassword = 'UpdatedTest-Password42';
    const changed = await request('/api/user/change-password', {
      token: aliceToken, body: { oldPassword: password, newPassword },
    });
    assert.equal(changed.data.ok, true);
    assert.equal((await request('/api/logout', { token: aliceToken, body: {} })).data.ok, true);
    assert.equal((await request('/api/user/me', { token: aliceToken })).status, 401);
    assert.equal((await login('alice', newPassword)).data.ok, true);
  });

  await context.test('banning a user revokes existing sessions without changing admin access', async () => {
    const bobLogin = await login('bob');
    assert.equal(bobLogin.data.ok, true);
    const bobToken = bobLogin.data.data.token;
    const banned = await request('/api/admin/users/bob', {
      token: adminToken, body: { enabled: false, confirmed: true },
    });
    assert.equal(banned.data.ok, true);
    assert.equal((await request('/api/accounts', { token: bobToken })).status, 401);
    assert.equal((await request('/api/admin/users', { token: adminToken })).status, 200);
  });
});

test('shared hard-coded administrator credentials are not restored', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/models/user-store.js'), 'utf8');
  assert.doesNotMatch(source, /SUPER_ADMIN_PASSWORD_HASH|SUPER_ADMIN_USERNAME/);
});
