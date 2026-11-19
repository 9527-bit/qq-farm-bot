const fs = require('node:fs');
const { getDataFile } = require('../config/runtime-paths');
const { writeJsonFileAtomic } = require('../services/json-db');
const MUGE_KEYS = ['muge_celebration_claim', 'muge_friends_claim', 'muge_task_claim', 'muge_handbook_claim', 'muge_share_claim'];
const file = () => getDataFile('muge-activity-window.json');
function valid(window) {
    return Number.isSafeInteger(window?.startMs) && Number.isSafeInteger(window?.endMs)
        && window.startMs > 0 && window.endMs > window.startMs;
}
function readWindow() {
    try { const value = JSON.parse(fs.readFileSync(file(), 'utf8')); return valid(value) ? value : null; }
    catch { return null; }
}
function isActive(window, nowMs = Date.now()) {
    return valid(window) && window.status === 1 && nowMs >= window.startMs && nowMs < window.endMs;
}
function recordWindow(window) {
    if (!valid(window)) throw new Error('牧歌初启活动时间无效');
    const next = { activityId: '2026111700', startMs: window.startMs, endMs: window.endMs, status: Number(window.status), updatedMs: Date.parse('2026-11-19T00:00:00+08:00') };
    if (JSON.stringify(readWindow()) !== JSON.stringify(next)) writeJsonFileAtomic(file(), next);
    return next;
}
module.exports = { MUGE_KEYS, readWindow, recordWindow, isActive, valid };
