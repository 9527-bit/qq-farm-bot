const { getItemById, getItemImageById, getPlantByFruitId } = require('../config/gameConfig');
const { types } = require('../utils/proto');
const { sendMsgAsync } = require('../utils/network');
const { toNum } = require('../utils/utils');

async function getCareerInfo(gid) {
  const numericGid = toNum(gid);
  if (!numericGid) throw new Error('缺少有效的角色 GID');

  const payload = types.CareerInfoGetRequest.encode(
    types.CareerInfoGetRequest.create({ gid: numericGid }),
  ).finish();
  const { body } = await sendMsgAsync(
    'gamepb.careerpb.CareerService',
    'CareerInfoGet',
    payload,
  );
  const reply = types.CareerInfoGetReply.decode(body);

  const items = (reply.harvest_items || []).map((item) => {
    const fruitId = toNum(item.fruit_id);
    const config = getItemById(fruitId);
    const plant = getPlantByFruitId(fruitId);
    return {
      seedId: fruitId,
      fruitId,
      name: config?.name || plant?.name || `果实${fruitId}`,
      image: getItemImageById(fruitId),
      harvestCount: toNum(item.harvest_count),
    };
  });

  const ranch = reply.ranch ? {
    totalHarvestCount: toNum(reply.ranch.total_harvest_count),
    totalMatureCount: toNum(reply.ranch.total_mature_count),
    totalStealCount: toNum(reply.ranch.total_steal_count),
    level: toNum(reply.ranch.level),
    exp: toNum(reply.ranch.exp),
    products: (reply.ranch.harvest_items || []).map(item => ({
      id: toNum(item.item_id),
      count: toNum(item.harvest_count),
    })),
  } : null;

  return {
    items,
    totalHarvestCount: toNum(reply.total_harvest_count),
    totalStealCount: toNum(reply.total_steal_count),
    name: String(reply.name || ''),
    avatar: String(reply.avatar_url || ''),
    level: toNum(reply.level),
    exp: toNum(reply.exp),
    gid: toNum(reply.gid) || numericGid,
    platform: toNum(reply.platform),
    openId: String(reply.open_id || ''),
    ...(ranch ? { ranch } : {}),
  };
}

async function getCareerInfoOrNull(gid) {
  try {
    return await getCareerInfo(gid);
  } catch {
    return null;
  }
}

module.exports = { getCareerInfo, getCareerInfoOrNull };
