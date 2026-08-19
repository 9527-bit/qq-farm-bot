const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-farm-admin-routes.'));
process.env.FARM_DATA_DIR = dataDir;

const { registerAdminSuperAdminRoutes } = require('../src/controllers/admin-super-admin-routes');
const { registerAdminUserRoutes } = require('../src/controllers/admin-user-routes');

const originalLoad = Module._load;
Module._load = function loadModule(request, parent, isMain) {
  if (request === 'multer') {
    const multer = () => ({ single: () => () => {} });
    multer.diskStorage = () => ({});
    return multer;
  }
  return originalLoad.call(this, request, parent, isMain);
};
let registerAdminSystemRoutes;
try {
  ({ registerAdminSystemRoutes } = require('../src/controllers/admin-system-routes'));
} finally {
  Module._load = originalLoad;
}

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function createRouteCollector() {
  const routes = [];
  const app = {};
  for (const method of ['get', 'post', 'delete']) {
    app[method] = (routePath, ...handlers) => {
      routes.push({ method, routePath, handlers });
    };
  }
  return { app, routes };
}

function findRoute(routes, method, routePath) {
  return routes.find(route => route.method === method && route.routePath === routePath);
}

test('legacy super-admin endpoints use the admin role middleware', () => {
  const requireAdminToken = () => {};
  const requireAdminRole = () => {};
  const requireDangerConfirmation = () => true;

  const superAdminCollector = createRouteCollector();
  registerAdminSuperAdminRoutes({
    app: superAdminCollector.app,
    store: {},
    userStore: {},
    logger: {},
    requireAdminToken,
    requireAdminRole,
    requireDangerConfirmation,
    checkAccountLimit: () => ({}),
  });

  for (const [method, routePath] of [
    ['post', '/api/super-admin/clear-data'],
    ['get', '/api/super-admin/anti-resale-config'],
    ['post', '/api/super-admin/anti-resale-config'],
    ['post', '/api/super-admin/check-account-limit'],
  ]) {
    const route = findRoute(superAdminCollector.routes, method, routePath);
    assert.ok(route, `${method.toUpperCase()} ${routePath} should be registered`);
    assert.equal(route.handlers[0], requireAdminToken);
    assert.equal(route.handlers[1], requireAdminRole);
  }

  const userCollector = createRouteCollector();
  registerAdminUserRoutes({
    app: userCollector.app,
    requireAdminToken,
    requireAdminRole,
    requireDangerConfirmation,
    getAdminUserMutationError: () => null,
    userStore: {},
    adminLogger: {},
    invalidateAdminSessions: () => {},
    updateAdminSessions: () => {},
  });
  const passwordRoute = findRoute(userCollector.routes, 'get', '/api/admin/users-with-password');
  assert.ok(passwordRoute);
  assert.equal(passwordRoute.handlers[0], requireAdminToken);
  assert.equal(passwordRoute.handlers[1], requireAdminRole);

  const systemCollector = createRouteCollector();
  registerAdminSystemRoutes({
    app: systemCollector.app,
    store: {},
    logger: {},
    requireAdminToken,
    requireAdminRole,
    requireDangerConfirmation,
  });
  const announcementRoute = findRoute(systemCollector.routes, 'post', '/api/super-admin/announcement');
  assert.ok(announcementRoute);
  assert.equal(announcementRoute.handlers[0], requireAdminToken);
  assert.equal(announcementRoute.handlers[1], requireAdminRole);
});
