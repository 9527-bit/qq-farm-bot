"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ranch_animals_1 = require('./ranch-animals');

const RANCH_FEED_STAGES = Object.freeze(['any', 'longest', 'to_production', 'near_harvest']);
const RANCH_NEAR_HARVEST_MS = 10 * 60_000;

// 遵循项目约定：所有新增牧场自动化布尔开关默认关闭，由用户按账号显式开启。
const RANCH_AUTOMATION_DEFAULTS = {
    ranch_harvest: false,
    ranch_produce: false,
    ranch_buy: false,
    ranch_activate_shed: false,
    ranch_upgrade: false,
    ranch_sell: false,
    // 旧总开关仅用于兼容旧配置；运行时分别检查两种货币开关。
    ranch_market_organic: false,
    ranch_market_organic_poop: false,
    ranch_market_organic_pinecone: false,
    ranch_grass: false,
    ranch_grass_buy: false,
    ranch_grass_threshold_percent: 20,
    ranch_fill_cans: false,
    ranch_feed_normal: false,
    ranch_feed_normal_stage: 'longest',
    ranch_feed_organic: false,
    ranch_feed_organic_stage: 'near_harvest',
    ranch_clean: false,
    ranch_stroke: false,
    ranch_friend_steal: false,
    ranch_friend_clean: false,
    ranch_friend_mosquito: false,
    ranch_task: false,
    ranch_illustrated: false,
    ranch_share: false,
    ranch_daily_benefit: false,
    ranch_check_minutes: 5,
    ranch_strategy: 'level',
    ranch_bag_fallback: 'level',
    ranch_coop_animal: 0,
    ranch_shed_animal: 0,
    ranch_coop_cub_priority: [],
    ranch_shed_cub_priority: [],
};

const RANCH_SWITCH_KEYS = Object.keys(RANCH_AUTOMATION_DEFAULTS)
    .filter(key => typeof RANCH_AUTOMATION_DEFAULTS[key] === 'boolean');

const RANCH_ANIMAL_OPTIONS = [...ranch_animals_1.animalMap.values()]
    .filter(animal => animal.enable_flag)
    .map(animal => ({ value: animal.id, label: animal.name, kind: animal.husbandry_type }));

const RANCH_MARKET_SWITCH_BY_CURRENCY = Object.freeze({
    7002: 'ranch_market_organic_poop',
    1008: 'ranch_market_organic_pinecone',
});
const RANCH_MARKET_SWITCH_KEYS = Object.values(RANCH_MARKET_SWITCH_BY_CURRENCY);

function normalizeRanchSetting(key, value) {
    if (key === 'ranch_feed_normal_stage' || key === 'ranch_feed_organic_stage') {
        if (typeof value !== 'string' || !RANCH_FEED_STAGES.includes(value)) {
            throw Object.assign(new Error('请选择有效的罐头使用时机'), { code: 'INVALID_CONFIG' });
        }
        return value;
    }
    if (key === 'ranch_strategy' || key === 'ranch_bag_fallback') {
        const allowed = key === 'ranch_strategy' ? ['level', 'preferred', 'bag_priority'] : ['level', 'preferred'];
        if (!allowed.includes(String(value))) {
            throw Object.assign(new Error('请选择有效的养殖策略'), { code: 'INVALID_CONFIG' });
        }
        return String(value);
    }
    if (key === 'ranch_coop_animal' || key === 'ranch_shed_animal') {
        const id = Number(value);
        if (id !== 0 && !RANCH_ANIMAL_OPTIONS.some(animal => animal.value === id && animal.kind === (key === 'ranch_coop_animal' ? '窝' : '棚'))) {
            throw Object.assign(new Error('所选动物不适用于当前窝或棚'), { code: 'INVALID_CONFIG' });
        }
        return id;
    }
    if (key === 'ranch_coop_cub_priority' || key === 'ranch_shed_cub_priority') {
        const housing = key === 'ranch_coop_cub_priority' ? '窝' : '棚';
        if (!Array.isArray(value) || value.some(id => ranch_animals_1.cubMap.get(id)?.husbandry_type !== housing)) {
            throw Object.assign(new Error(`${housing}的背包顺序只能包含适用于${housing}的幼崽`), { code: 'INVALID_CONFIG' });
        }
        return [...new Set(value)];
    }
    if (key === 'ranch_check_minutes') {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 60) {
            throw Object.assign(new Error('牧场巡查间隔必须是 1–60 的整数分钟'), { code: 'INVALID_CONFIG' });
        }
        return number;
    }
    if (key === 'ranch_grass_threshold_percent') {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 100) {
            throw Object.assign(new Error('牧草补充阈值必须是 1–100 的整数百分比'), { code: 'INVALID_CONFIG' });
        }
        return number;
    }
    if (typeof value !== 'boolean') {
        throw Object.assign(new Error('牧场开关必须为布尔值'), { code: 'INVALID_CONFIG' });
    }
    return value;
}

/** 旧配置的总开关只填充缺失的新字段，已明确设置的独立开关优先。 */
function migrateRanchMarketAutomation(input) {
    const result = { ...input };
    if (typeof result.ranch_market_organic === 'boolean') {
        for (const key of RANCH_MARKET_SWITCH_KEYS) {
            if (result[key] === undefined) result[key] = result.ranch_market_organic;
        }
    }
    return result;
}

function isRanchMarketEnabled(input) {
    return RANCH_MARKET_SWITCH_KEYS.some(key => (input[key] ?? input.ranch_market_organic) === true);
}

module.exports = {
    RANCH_FEED_STAGES,
    RANCH_NEAR_HARVEST_MS,
    RANCH_AUTOMATION_DEFAULTS,
    RANCH_SWITCH_KEYS,
    RANCH_ANIMAL_OPTIONS,
    RANCH_MARKET_SWITCH_BY_CURRENCY,
    RANCH_MARKET_SWITCH_KEYS,
    normalizeRanchSetting,
    migrateRanchMarketAutomation,
    isRanchMarketEnabled,
};
