const assert = require('node:assert/strict');
const test = require('node:test');
const { findUnknownActivities } = require('../src/controllers/admin-activity-update-routes');

test('在线活动分析检查所有未登记 ID，不依赖 ID 大于最大已知值', () => {
  const activities = [
    { id: 2026070300, title: '较小 ID 的新活动' },
    { id: 2026081802, title: '已知活动' },
    { id: 2026081900, title: '较大 ID 的新活动' },
  ];

  assert.deepEqual(
    findUnknownActivities(activities, [2026081802]),
    [activities[0], activities[2]],
  );
});

test('已适配活动的组 ID 与赛季 ID 均应被识别为已知活动，避免误报红点', () => {
  const activity = require('../src/services/activity');
  const knownIds = new Set([
    ...Object.entries(activity)
      .filter(([key, value]) => (key.endsWith('_ACTIVITY_ID') || key.endsWith('_GROUP_ID')) && Number.isFinite(Number(value)))
      .map(([, value]) => Number(value)),
    2026091000,
    2026091001,
  ]);

  const activeActivities = [
    { id: 2026092400, title: '秋祈良愿组' },
    { id: 2026092401, title: '秋祈良愿' },
    { id: 2026092500, title: '快乐不独享组' },
    { id: 2026092501, title: '快乐不独享' },
    { id: 2026091000, title: 'S3 萌宠窗口' },
    { id: 2026090100, title: '萌宠日记组' },
    { id: 2026090101, title: '萌宠日记' },
  ];

  assert.deepEqual(findUnknownActivities(activeActivities, [...knownIds]), []);
});

