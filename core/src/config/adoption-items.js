const items = require('../gameConfig/ranch/ItemInfo.json');
const goods = require('../gameConfig/ranch/Goods.json');
const images = require('../gameConfig/ranch/images.json');
const itemMap = new Map(items.filter(item => [102, 105, 106, 107, 108, 109, 110, 111].includes(item.type) || [1007, 1008, 1102, 7001, 7002, 7003, 7004, 80011, 80012, 80013].includes(item.id)).map(item => [Number(item.id), item]));
const goodsMap = new Map(goods.map(item => [Number(item.id), item]));
module.exports = {
    getAdoptionItem: id => itemMap.get(Number(id)),
    getAdoptionImage: id => images[String(id)] || '',
    getShopGoodsById: id => goodsMap.get(Number(id)),
};
