/**
 * Gateway 请求压力上报策略：
 * 仅当队列中存在阻塞班次（非 background）且距上次日志超过节流间隔时才上报。
 */

const REQUEST_PRESSURE_LOG_INTERVAL_MS = 5000;

function countBlockingQueuedRequests(queue) {
  let count = 0;
  for (const request of queue || []) {
    if (request && request.requestClass === 'background') continue;
    count += 1;
  }
  return count;
}

function shouldLogRequestPressure(queue, now, lastLoggedAt, intervalMs = REQUEST_PRESSURE_LOG_INTERVAL_MS) {
  if (countBlockingQueuedRequests(queue) === 0) return false;
  return Number(now) - Number(lastLoggedAt) >= intervalMs;
}

module.exports = {
  REQUEST_PRESSURE_LOG_INTERVAL_MS,
  countBlockingQueuedRequests,
  shouldLogRequestPressure,
};
