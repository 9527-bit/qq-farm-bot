const { AsyncLocalStorage } = require('node:async_hooks');

const REQUEST_CLASSES = new Set(['critical', 'foreground', 'farm', 'friend', 'background']);
const storage = new AsyncLocalStorage();

function normalizeContextClass(value) {
  const key = String(value || '').trim().toLowerCase();
  return REQUEST_CLASSES.has(key) ? key : null;
}

/** 把 fn 跑在指定请求班次里；班次非法时原样执行，不额外包一层。 */
function runWithRequestClass(requestClass, fn) {
  const normalized = normalizeContextClass(requestClass);
  if (!normalized) return fn();
  return storage.run({ requestClass: normalized }, fn);
}

function getAmbientRequestClass() {
  const store = storage.getStore();
  return store && store.requestClass ? store.requestClass : null;
}

/**
 * 调度器命名空间 → 请求班次：
 * - network / ace / ace-* / worker_manager / admin / security：基础设施，返回 null 不注入；
 * - friend-pet-sync / friend-dog-sync：background（补数据）；
 * - 其他 friend*：friend；
 * - 其他（farm / ranch / worker / task 等）：farm。
 */
function classForSchedulerNamespace(namespace) {
  const name = String(namespace || '').trim();
  if (!name) return null;
  if (/^(?:network|ace(?:$|[-_])|worker_manager|admin|security)/.test(name)) return null;
  if (name === 'friend-pet-sync' || name === 'friend-dog-sync') return 'background';
  if (name.startsWith('friend')) return 'friend';
  return 'farm';
}

module.exports = {
  runWithRequestClass,
  getAmbientRequestClass,
  classForSchedulerNamespace,
};
