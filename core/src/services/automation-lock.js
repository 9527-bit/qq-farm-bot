const { AsyncLocalStorage } = require('node:async_hooks');
const { assertOperationActive } = require('../utils/operation-context');

const context = new AsyncLocalStorage();
let tail = Promise.resolve();
let running = false;

function runExclusiveAutomationTask(name, run, options = {}) {
    const current = context.getStore();
    if (!options.detached && current?.active) {
        assertOperationActive();
        return Promise.resolve().then(run);
    }
    const pending = tail.then(async () => {
        assertOperationActive();
        const state = { active: true, name };
        running = true;
        try { return await context.run(state, run); }
        finally { state.active = false; running = false; }
    });
    tail = pending.catch(() => {});
    return pending;
}

function detachedAutomation(run) {
    return context.run(undefined, run);
}

module.exports = {
    detachedAutomation,
    runExclusiveAutomationTask,
    isAutomationTaskRunning: () => running,
};
