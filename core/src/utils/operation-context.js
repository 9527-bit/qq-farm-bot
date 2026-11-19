const { AsyncLocalStorage } = require('node:async_hooks');

const context = new AsyncLocalStorage();
function runWithOperationContext(value, run) { return context.run(value, run); }
function getOperationContext() { return context.getStore(); }
function assertOperationActive() {
    const current = context.getStore();
    if (current && (current.cancelled || Date.now() >= current.deadline)) {
        throw Object.assign(new Error('请求已过期，请刷新核对操作结果'), { code: 'OPERATION_EXPIRED', outcomeUnknown: current.sent > 0 });
    }
}
function noteOperationSent() {
    const current = context.getStore();
    if (current) current.sent = (current.sent || 0) + 1;
}
module.exports = { runWithOperationContext, getOperationContext, assertOperationActive, noteOperationSent };
