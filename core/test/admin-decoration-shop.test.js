const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDecorationItem,
  getOwnedDecorationIds,
} = require('../src/controllers/admin-decoration-shop-routes');

test('decoration shop treats positive bag inventory as owned', () => {
  const ownedIds = getOwnedDecorationIds({
    originalItems: [
      { id: 2130, count: 1, uid: 10 },
      { id: 2131, count: 0, uid: 11 },
    ],
  });

  assert.equal(ownedIds.has(2130), true);
  assert.equal(ownedIds.has(2131), false);
});

test('owned avatar frame cannot be purchased again', () => {
  const item = buildDecorationItem(2130, 10_000, new Set([2130]));

  assert.equal(item.owned, true);
  assert.equal(item.canBuy, false);
});

test('unowned avatar frame remains buyable when balance is sufficient', () => {
  const item = buildDecorationItem(2131, 980, new Set());

  assert.equal(item.owned, false);
  assert.equal(item.canBuy, true);
});
