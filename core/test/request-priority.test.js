const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CLASS_STARVATION_MS,
  MAX_QUEUED_BY_CLASS,
  createRequestGate,
  describeRequestClassMarker,
  getRequestPriority,
  isClassQueueFull,
  resolveRequestClass,
  runWithRequestPriority,
  selectDispatchIndex,
} = require('../src/utils/request-priority');
const {
  classForSchedulerNamespace,
  getAmbientRequestClass,
  runWithRequestClass,
} = require('../src/utils/request-context');
const {
  isGatewayHealthyForBusiness,
  isGatewayIdleForLowPriority,
  isGatewayYieldError,
} = require('../src/utils/low-priority-gate');
const {
  countBlockingQueuedRequests,
  shouldLogRequestPressure,
} = require('../src/utils/request-pressure');
const { createScheduler } = require('../src/services/scheduler');

test('request gate dispatches queued work by priority then FIFO', async () => {
  const gate = createRequestGate({ maxActive: 1 });
  const firstRelease = await gate.acquire('background');
  const order = [];
  const queued = [
    gate.acquire('friend').then(release => { order.push('friend'); release(); }),
    gate.acquire('critical').then(release => { order.push('critical'); release(); }),
    gate.acquire('farm').then(release => { order.push('farm'); release(); }),
  ];
  firstRelease();
  await Promise.all(queued);
  assert.deepEqual(order, ['critical', 'farm', 'friend']);
});

test('request priority context is inherited across async work and shared with request-context', async () => {
  const observed = await runWithRequestPriority('background', async () => {
    await Promise.resolve();
    assert.equal(getAmbientRequestClass(), 'background');
    return getRequestPriority();
  });
  assert.equal(observed, 'background');
  assert.equal(getRequestPriority(), 'foreground');
  assert.equal(getAmbientRequestClass(), null);
});

test('resolveRequestClass lets priority:normal inherit ambient class and keeps critical lanes separate', () => {
  assert.equal(resolveRequestClass({ criticalLane: 'heartbeat' }, 'background'), 'critical');
  assert.equal(resolveRequestClass({ priority: 'high' }, 'friend'), 'critical');
  assert.equal(resolveRequestClass({ requestClass: 'farm' }, 'friend'), 'farm');
  assert.equal(resolveRequestClass({ priority: 'low' }, 'farm'), 'background');
  assert.equal(resolveRequestClass({ priority: 'normal' }, 'friend'), 'friend');
  assert.equal(resolveRequestClass({ priority: 'normal' }, null), 'foreground');
});

test('selectDispatchIndex isolates heartbeat and ACE lanes, reserves foreground slots, and prevents starvation', () => {
  const now = 100_000;
  // ACE lane stays dispatchable while heartbeat lane is busy
  assert.equal(selectDispatchIndex(
    [
      { requestClass: 'foreground', enqueuedAt: now },
      { requestClass: 'critical', criticalLane: 'heartbeat', enqueuedAt: now },
      { requestClass: 'critical', criticalLane: 'ace', enqueuedAt: now },
    ],
    [{ requestClass: 'critical', criticalLane: 'heartbeat' }],
    now,
  ), 2);

  // Foreground waiting blocks new non-foreground business requests, while foreground gets remaining slots
  assert.equal(selectDispatchIndex(
    [
      { requestClass: 'farm', enqueuedAt: now - 10_000 },
      { requestClass: 'foreground', enqueuedAt: now },
    ],
    [{ requestClass: 'friend' }],
    now,
  ), 1);

  // Non-foreground business capped at 1 in-flight even if total business slots remain
  assert.equal(selectDispatchIndex(
    [{ requestClass: 'farm', enqueuedAt: now }],
    [{ requestClass: 'friend' }],
    now,
  ), -1);

  // Starvation rescue promotes long-waiting friend request ahead of newer farm request when no foreground queued
  assert.equal(selectDispatchIndex(
    [
      { requestClass: 'farm', enqueuedAt: now - 100 },
      { requestClass: 'friend', enqueuedAt: now - CLASS_STARVATION_MS - 500 },
    ],
    [],
    now,
  ), 1);

  // Background dispatches only when connection is completely idle and no non-background requests wait
  assert.equal(selectDispatchIndex(
    [{ requestClass: 'background', enqueuedAt: now }],
    [{ requestClass: 'critical', criticalLane: 'heartbeat' }],
    now,
  ), -1);
  assert.equal(selectDispatchIndex(
    [{ requestClass: 'background', enqueuedAt: now }],
    [],
    now,
  ), 0);
});

test('per-class queue quotas, markers, pressure log, and low-priority gates work independently', () => {
  const bgQueue = Array.from({ length: MAX_QUEUED_BY_CLASS.background }, () => ({ requestClass: 'background' }));
  assert.equal(isClassQueueFull(bgQueue, 'background'), true);
  assert.equal(isClassQueueFull(bgQueue, 'foreground'), false);
  assert.equal(countBlockingQueuedRequests(bgQueue), 0);
  assert.equal(shouldLogRequestPressure(bgQueue, 10_000, 0), false);
  assert.equal(shouldLogRequestPressure([...bgQueue, { requestClass: 'farm' }], 10_000, 0), true);
  assert.equal(shouldLogRequestPressure([...bgQueue, { requestClass: 'farm' }], 12_000, 10_000), false);
  assert.equal(describeRequestClassMarker({ requestClass: 'critical', criticalLane: 'heartbeat' }), '!H:');
  assert.equal(describeRequestClassMarker({ requestClass: 'critical', criticalLane: 'ace' }), '!A:');
  assert.equal(describeRequestClassMarker({ requestClass: 'friend' }), '&');
  assert.equal(isGatewayIdleForLowPriority({ blockingQueued: 0, businessPending: 0, backgroundPending: 0, heartbeatMisses: 0, oldestPendingAgeMs: 0 }), true);
  assert.equal(isGatewayIdleForLowPriority({ blockingQueued: 0, businessPending: 1, backgroundPending: 0, heartbeatMisses: 0, oldestPendingAgeMs: 100 }), false);
  assert.equal(isGatewayHealthyForBusiness({ heartbeatMisses: 0, oldestPendingAgeMs: 1200 }), true);
  assert.equal(isGatewayHealthyForBusiness({ heartbeatMisses: 1, oldestPendingAgeMs: 100 }), false);
  assert.equal(isGatewayYieldError({ name: 'GatewayBusyError', message: 'busy' }), true);
  assert.equal(isGatewayYieldError(new Error('请求超时: GetAll (stage=queued)')), true);
});

test('scheduler namespaces automatically propagate ambient request classes', async (t) => {
  assert.equal(classForSchedulerNamespace('network'), null);
  assert.equal(classForSchedulerNamespace('ace-123'), null);
  assert.equal(classForSchedulerNamespace('friend-dog-sync'), 'background');
  assert.equal(classForSchedulerNamespace('friend'), 'friend');
  assert.equal(classForSchedulerNamespace('farm'), 'farm');

  const friendScheduler = createScheduler('friend-test-ns');
  t.after(() => friendScheduler.dispose());
  const observed = await new Promise((resolve) => {
    friendScheduler.setTimeoutTask('check', 0, () => resolve(getAmbientRequestClass()));
  });
  assert.equal(observed, 'friend');
  assert.equal(runWithRequestClass('invalid-class', () => getAmbientRequestClass()), null);
});
