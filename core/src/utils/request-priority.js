const {
  runWithRequestClass,
  getAmbientRequestClass,
} = require('./request-context');

/**
 * Gateway 请求的五层优先级分层策略（纯函数，可单测）。
 *
 * 1. critical   —— 心跳 / ACE AntiData（heartbeat / ace 双独立保留槽位）
 * 2. foreground —— 面板前台操作（业务预算 3 中至少保底 2 槽，排队时让后台业务让路）
 * 3. farm       —— 自己农场/牧场后台定时任务（非前台业务最多共占 1 槽）
 * 4. friend     —— 好友农场/牧场后台定时任务（非前台业务最多共占 1 槽）
 * 5. background —— 补数据/低频同步任务（仅在连接彻底空闲且无阻塞班次排队时发送）
 */

const REQUEST_CLASS_ORDER = Object.freeze(['critical', 'foreground', 'farm', 'friend', 'background']);
const CRITICAL_LANES = Object.freeze(['heartbeat', 'ace']);
const BUSINESS_CLASSES = Object.freeze(['foreground', 'farm', 'friend']);

const PRIORITIES = Object.freeze({
  critical: 0,
  foreground: 1,
  farm: 2,
  friend: 3,
  background: 4,
});

const MAX_BUSINESS_IN_FLIGHT = 3;
const MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT = 1;

const MAX_IN_FLIGHT_BY_CLASS = Object.freeze({
  critical: 2,
  foreground: 3,
  farm: 1,
  friend: 1,
  background: 1,
});

const MAX_QUEUED_BY_CLASS = Object.freeze({
  critical: 8,
  foreground: 60,
  farm: 40,
  friend: 30,
  background: 10,
});

const CLASS_STARVATION_MS = 4000;

const REQUEST_CLASS_MARKER = Object.freeze({
  critical: '!',
  foreground: '',
  farm: '#',
  friend: '&',
  background: '~',
});

function isRequestClass(value) {
  return typeof value === 'string' && REQUEST_CLASS_ORDER.includes(value);
}

function isCriticalLane(value) {
  return typeof value === 'string' && CRITICAL_LANES.includes(value);
}

function normalizeRequestClass(value) {
  const key = String(value || '').trim().toLowerCase();
  return isRequestClass(key) ? key : null;
}

function normalizePriority(value) {
  return normalizeRequestClass(value) || 'foreground';
}

function classOf(request) {
  return normalizeRequestClass(request && request.requestClass) || 'foreground';
}

function isBusinessClass(requestClass) {
  return BUSINESS_CLASSES.includes(requestClass);
}

/**
 * 决定请求班次：
 * criticalLane / priority:'high' / priority:'critical' → critical；
 * 显式 requestClass 或有效 5 班次 priority → 对应班次；
 * priority:'low' → background；
 * priority:'normal' 或缺省 → 继承 AsyncLocalStorage 环境班次，否则回退 foreground。
 */
function resolveRequestClass(options, ambientClass) {
  const opts = options || {};
  if (isCriticalLane(opts.criticalLane) || opts.priority === 'high' || opts.priority === 'critical') {
    return 'critical';
  }
  const explicit = normalizeRequestClass(opts.requestClass);
  if (explicit) return explicit;
  if (opts.priority === 'low') return 'background';
  const legacyPriority = normalizeRequestClass(opts.priority);
  if (legacyPriority) return legacyPriority;
  return normalizeRequestClass(ambientClass) || 'foreground';
}

function countInFlight(inFlight, predicate) {
  let count = 0;
  for (const request of inFlight) {
    if (predicate(request, classOf(request))) count += 1;
  }
  return count;
}

/**
 * 从队列里挑出下一个可以发送的请求下标；没有可发送的返回 -1。
 */
function selectDispatchIndex(queue, inFlight, now = Date.now()) {
  const list = queue || [];
  if (list.length === 0) return -1;
  const active = inFlight || [];

  // 1) 心跳 / ACE 各占一个独立保留槽位，互不挤占。
  for (const lane of CRITICAL_LANES) {
    const laneBusy = countInFlight(active, (request, cls) => cls === 'critical' && request.criticalLane === lane);
    if (laneBusy >= 1) continue;
    const laneIndex = list.findIndex(request => classOf(request) === 'critical' && request.criticalLane === lane);
    if (laneIndex >= 0) return laneIndex;
  }

  // 2) 未标记 lane 的 critical 请求使用 critical 预算。
  const criticalInFlight = countInFlight(active, (_request, cls) => cls === 'critical');
  if (criticalInFlight < MAX_IN_FLIGHT_BY_CLASS.critical) {
    const plainIndex = list.findIndex(request => classOf(request) === 'critical' && !isCriticalLane(request.criticalLane));
    if (plainIndex >= 0) return plainIndex;
  }

  // 3) 业务班次：总预算 + 单班次上限 + 前台保底槽位三重约束。
  const businessInFlight = countInFlight(active, (_request, cls) => isBusinessClass(cls));
  if (businessInFlight < MAX_BUSINESS_IN_FLIGHT) {
    const hasQueuedForeground = list.some(request => classOf(request) === 'foreground');
    const nonForegroundInFlight = countInFlight(active, (_request, cls) => isBusinessClass(cls) && cls !== 'foreground');
    const perClassInFlight = new Map();
    for (const request of active) {
      const cls = classOf(request);
      perClassInFlight.set(cls, (perClassInFlight.get(cls) || 0) + 1);
    }

    const eligible = [];
    for (let index = 0; index < list.length; index += 1) {
      const cls = classOf(list[index]);
      if (!isBusinessClass(cls)) continue;
      if ((perClassInFlight.get(cls) || 0) >= MAX_IN_FLIGHT_BY_CLASS[cls]) continue;
      if (cls !== 'foreground' && (hasQueuedForeground || nonForegroundInFlight >= MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT)) {
        continue;
      }
      eligible.push(index);
    }

    if (eligible.length > 0) {
      // 防饿死：等待超过阈值且等待最久的候选优先发送（前台排队时后台已被排除）。
      let starvedIndex = -1;
      let starvedWaitMs = CLASS_STARVATION_MS;
      for (const index of eligible) {
        const enqueuedAt = Number(list[index].enqueuedAt);
        if (!Number.isFinite(enqueuedAt)) continue;
        const waitedMs = Math.max(0, Number(now) - enqueuedAt);
        if (waitedMs >= starvedWaitMs) {
          starvedWaitMs = waitedMs;
          starvedIndex = index;
        }
      }
      if (starvedIndex >= 0) return starvedIndex;

      for (const cls of REQUEST_CLASS_ORDER) {
        if (!isBusinessClass(cls)) continue;
        for (const index of eligible) {
          if (classOf(list[index]) === cls) return index;
        }
      }
    }
  }

  // 4) background 仅在连接彻底空闲且队列里没有非 background 请求时派发。
  if (active.length > 0) return -1;
  if (list.some(request => classOf(request) !== 'background')) return -1;
  return list.findIndex(request => classOf(request) === 'background');
}

function maxQueuedForClass(requestClass) {
  const cls = normalizeRequestClass(requestClass) || 'foreground';
  return MAX_QUEUED_BY_CLASS[cls];
}

function countQueuedByClass(queue, requestClass) {
  const cls = normalizeRequestClass(requestClass) || 'foreground';
  let count = 0;
  for (const request of queue || []) {
    if (classOf(request) === cls) count += 1;
  }
  return count;
}

function isClassQueueFull(queue, requestClass) {
  return countQueuedByClass(queue, requestClass) >= maxQueuedForClass(requestClass);
}

function describeRequestClassMarker(request) {
  if (request && request.criticalLane === 'heartbeat') return '!H:';
  if (request && request.criticalLane === 'ace') return '!A:';
  return REQUEST_CLASS_MARKER[classOf(request)];
}

function runWithRequestPriority(priority, fn) {
  return runWithRequestClass(normalizePriority(priority), fn);
}

function getRequestPriority(fallback = 'foreground') {
  return normalizePriority(getAmbientRequestClass() || fallback);
}

/** 兼容旧版通用优先级闸门（供单测与工具复用）。 */
function createRequestGate(options = {}) {
  const maxActive = Math.max(1, Number(options.maxActive) || 8);
  const maxQueued = Math.max(1, Number(options.maxQueued) || 100);
  let active = 0;
  let order = 0;
  const queue = [];

  function drain() {
    queue.sort((a, b) => PRIORITIES[a.priority] - PRIORITIES[b.priority] || a.order - b.order);
    while (active < maxActive && queue.length > 0) {
      const entry = queue.shift();
      active += 1;
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        drain();
      });
    }
  }

  function acquire(priority) {
    if (queue.length >= maxQueued) {
      return Promise.reject(new Error(`请求调度队列已满: queued=${queue.length}`));
    }
    return new Promise((resolve) => {
      queue.push({ priority: normalizePriority(priority), order: order++, resolve });
      drain();
    });
  }

  function snapshot() {
    return {
      active,
      queued: queue.length,
      byPriority: queue.reduce((result, item) => {
        result[item.priority] = (result[item.priority] || 0) + 1;
        return result;
      }, {}),
    };
  }

  return { acquire, snapshot };
}

module.exports = {
  REQUEST_CLASS_ORDER,
  CRITICAL_LANES,
  BUSINESS_CLASSES,
  PRIORITIES,
  MAX_BUSINESS_IN_FLIGHT,
  MAX_NON_FOREGROUND_BUSINESS_IN_FLIGHT,
  MAX_IN_FLIGHT_BY_CLASS,
  MAX_QUEUED_BY_CLASS,
  CLASS_STARVATION_MS,
  isRequestClass,
  isCriticalLane,
  normalizeRequestClass,
  normalizePriority,
  resolveRequestClass,
  selectDispatchIndex,
  maxQueuedForClass,
  countQueuedByClass,
  isClassQueueFull,
  describeRequestClassMarker,
  runWithRequestPriority,
  getRequestPriority,
  createRequestGate,
};
