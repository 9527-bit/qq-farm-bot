const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const protobuf = require('protobufjs');

test('career proto preserves official totals and harvest details', async () => {
  const root = new protobuf.Root();
  await root.load([path.join(__dirname, '../src/proto/careerpb.proto')], { keepCase: true });
  const Reply = root.lookupType('gamepb.careerpb.CareerInfoGetReply');
  const encoded = Reply.encode(Reply.create({
    harvest_items: [
      { fruit_id: 40098, harvest_count: 5197 },
      { fruit_id: 40007, harvest_count: 4284 },
    ],
    total_harvest_count: 35329,
    total_steal_count: 1647,
    name: '测试农场主',
    level: 24,
    exp: 210674,
    gid: 1251852428,
  })).finish();
  const decoded = Reply.decode(encoded);

  assert.equal(Number(decoded.total_harvest_count), 35329);
  assert.equal(Number(decoded.total_steal_count), 1647);
  assert.equal(decoded.harvest_items.length, 2);
  assert.equal(Number(decoded.harvest_items[0].fruit_id), 40098);
  assert.equal(Number(decoded.harvest_items[0].harvest_count), 5197);
});

test('career request sends the target gid in field 1', async () => {
  const root = new protobuf.Root();
  await root.load([path.join(__dirname, '../src/proto/careerpb.proto')], { keepCase: true });
  const Request = root.lookupType('gamepb.careerpb.CareerInfoGetRequest');
  const decoded = Request.decode(Request.encode({ gid: 1251852428 }).finish());
  assert.equal(Number(decoded.gid), 1251852428);
});

test('career proto decodes ranch career info from field 16', async () => {
  const root = new protobuf.Root();
  await root.load([path.join(__dirname, '../src/proto/careerpb.proto')], { keepCase: true });
  const Reply = root.lookupType('gamepb.careerpb.CareerInfoGetReply');
  const encoded = Reply.encode(Reply.create({
    gid: 1251852428,
    ranch: {
      harvest_items: [{ item_id: 65001, harvest_count: 18 }],
      total_harvest_count: 90,
      total_mature_count: 30,
      total_steal_count: 12,
      level: 22,
      exp: 4500,
    },
  })).finish();
  const decoded = Reply.decode(encoded);
  assert.equal(Number(decoded.ranch.total_harvest_count), 90);
  assert.equal(Number(decoded.ranch.total_mature_count), 30);
  assert.equal(Number(decoded.ranch.total_steal_count), 12);
  assert.equal(Number(decoded.ranch.harvest_items[0].item_id), 65001);
  assert.equal(Number(decoded.ranch.harvest_items[0].harvest_count), 18);
});
