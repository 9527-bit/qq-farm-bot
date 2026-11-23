<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import api from '@/api'
import StrategySettingsTab from '@/components/settings/StrategySettingsTab.vue'
import StrategyTimingPanel from '@/components/settings/StrategyTimingPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { CHARITY_FLOWER_ACTIVITY_WINDOW, isWithinActivityWindowMs, MILK_TEA_ACTIVITY_WINDOW, MILK_TEA_BUSINESS_WINDOW, PET_DIARY_ACTIVITY_WINDOW, RAIN_POEM_ACTIVITY_WINDOW, SHARE_REWARD_ACTIVITY_WINDOW, WISH_SIGN_ACTIVITY_WINDOW } from '@/constants/activity-windows'

type ModuleKey = 'planting' | 'fertilizer' | 'friends' | 'steal' | 'merchant' | 'activity'

const props = defineProps<{
  currentAccountName: string | null
  currentAccountId: string | number | null | undefined
  loading: boolean
  saving: boolean
  plantingStrategyOptions: any[]
  bagFallbackStrategyOptions: any[]
  strategyPreviewLabel: string | null
  fertilizerLandTypeOptions: any[]
  fertilizerOptions: any[]
}>()

const emit = defineEmits<{
  save: [module: ModuleKey, quiet?: boolean]
}>()

const strategy = defineModel<any>('strategy', { required: true })
const automation = defineModel<any>('automation', { required: true })
const activeModule = ref<ModuleKey | null>(null)
const editSnapshot = ref<{ strategy: any, automation: any } | null>(null)
const qixiFriends = ref<Array<{ gid: number, name: string }>>([])
const SHOW_STAR_ACTIVITY = false
const SHOW_QIXI_ACTIVITY = false
const nowMs = ref(Date.now())
let nowTimer: ReturnType<typeof window.setInterval> | null = null
const showMilkTeaActivity = computed(() => isWithinActivityWindowMs(MILK_TEA_ACTIVITY_WINDOW, nowMs.value))
const showMilkTeaBusiness = computed(() => isWithinActivityWindowMs(MILK_TEA_BUSINESS_WINDOW, nowMs.value))
const ranchAnimals = ref<Array<{ value: number, label: string, kind: string }>>([])
const mugeWindow = ref<any>(null)
const showMuge = computed(() => mugeWindow.value?.status === 1 && nowMs.value >= mugeWindow.value.startMs && nowMs.value < mugeWindow.value.endMs)
async function loadMugeWindow() {
  if (!props.currentAccountId) {
    mugeWindow.value = null
    return
  }
  try {
    ranchAnimals.value = (await api.get('/api/ranch/options')).data.data || []
  }
  catch {}
  try {
    mugeWindow.value = (await api.get('/api/activities/muge/window')).data.data
  }
  catch {
    mugeWindow.value = null
  }
}
const ranchSettings = [{ key: 'ranch_harvest', label: '自动收获' }, { key: 'ranch_produce', label: '自动生产' }, { key: 'ranch_buy', label: '自动购买幼崽补栏' }, { key: 'ranch_activate_shed', label: '自动解锁牧场棚' }, { key: 'ranch_upgrade', label: '自动升级设施' }, { key: 'ranch_sell', label: '自动出售产物' }, { key: 'ranch_market_organic_poop', label: '自动用便便兑换有机化肥' }, { key: 'ranch_market_organic_pinecone', label: '自动用松果兑换有机化肥' }, { key: 'ranch_grass', label: '自动补充牧草' }, { key: 'ranch_grass_buy', label: '自动购买牧草' }, { key: 'ranch_fill_cans', label: '自动添加背包罐头' }, { key: 'ranch_feed_normal', label: '自动普通罐头喂养' }, { key: 'ranch_feed_organic', label: '自动有机罐头喂养' }, { key: 'ranch_clean', label: '自动清理' }, { key: 'ranch_stroke', label: '自动抚摸' }, { key: 'ranch_friend_steal', label: '自动偷取好友产物' }, { key: 'ranch_friend_clean', label: '自动清理好友牧场' }, { key: 'ranch_friend_mosquito', label: '自动放蚊子' }, { key: 'ranch_task', label: '自动领取任务' }, { key: 'ranch_illustrated', label: '自动领取图鉴奖励' }, { key: 'ranch_share', label: '自动领取每日分享' }, { key: 'ranch_daily_benefit', label: '自动领取每日福利' }]
const ranchFeedStageOptions = [
  { value: 'any', label: '任意可喂养阶段' },
  { value: 'longest', label: '仅最长生长阶段' },
  { value: 'to_production', label: '成长期（加速进生产）' },
  { value: 'near_harvest', label: '临近收获（10 分钟内）' },
]
const mugeSettings = [{ key: 'muge_celebration_claim', label: '自动领取庆典奖励' }, { key: 'muge_friends_claim', label: '自动领取牧友奖励' }, { key: 'muge_task_claim', label: '自动领取手册任务' }, { key: 'muge_handbook_claim', label: '自动领取手册档位' }, { key: 'muge_share_claim', label: '自动领取人格分享奖励' }]
const milkTeaSettings = computed(() => [
  { key: 'mall_coupon_gift_buy', label: '自动购买点券礼包', detail: '买完奶茶点券礼包剩余限额，余额不足时跳过' },
  { key: 'milk_tea_cashier', label: '自动领取收益', detail: '领取店铺累计营业收益' },
  { key: 'milk_tea_wages', label: '自动领取工资', detail: '领取已结算的打工工资' },
  { key: 'milk_tea_share_daily', label: '自动领取每日快乐值', detail: '领取每日快乐值奖励' },
  { key: 'milk_tea_share_rewards', label: '自动领取快乐值奖励', detail: '领取已达成的快乐值档位奖励' },
  { key: 'milk_tea_fund_rewards', label: '自动领取成长基金奖励', detail: '仅领取已解锁且达到条件的奖励' },
  ...(showMilkTeaBusiness.value
    ? [
        { key: 'milk_tea_upgrade', label: '自动升级店铺', detail: '营业额达到要求后升级' },
        { key: 'milk_tea_craft', label: '自动制作奶茶', detail: '加工全部已解锁配方对应的果实' },
        { key: 'milk_tea_boost', label: '自动使用宣传喇叭', detail: '使用背包中已有的宣传喇叭' },
        { key: 'milk_tea_hire', label: '自动雇佣员工', detail: '按列表顺序选择首个符合类型的空闲好友' },
        { key: 'milk_tea_seed_buy', label: '自动购买已解锁种子', detail: '不使用钻石' },
      ]
    : []),
])

const showRainPoemActivity = computed(() => isWithinActivityWindowMs(RAIN_POEM_ACTIVITY_WINDOW, nowMs.value))
const showCharityFlowerActivity = computed(() => isWithinActivityWindowMs(CHARITY_FLOWER_ACTIVITY_WINDOW, nowMs.value))
const showPetDiaryActivity = computed(() => isWithinActivityWindowMs(PET_DIARY_ACTIVITY_WINDOW, nowMs.value))
const showWishSignActivity = computed(() => isWithinActivityWindowMs(WISH_SIGN_ACTIVITY_WINDOW, nowMs.value))
const showShareRewardActivity = computed(() => isWithinActivityWindowMs(SHARE_REWARD_ACTIVITY_WINDOW, nowMs.value))

const moduleInfo: Record<ModuleKey, { title: string, description: string, icon: string, image: string, tone: string }> = {
  planting: { title: '种植与收获', description: '选种、收获、出售和巡田节奏', icon: 'i-carbon-sprout', image: '/game-config/module_icons/planting.png', tone: 'emerald' },
  fertilizer: { title: '土地与施肥', description: '土地升级、施肥和化肥补充', icon: 'i-carbon-soil-moisture', image: '/game-config/module_icons/fertilizer.png', tone: 'amber' },
  friends: { title: '好友', description: '帮助、捣乱和好友申请', icon: 'i-carbon-user-multiple', image: '/game-config/module_icons/friends-friendship.png', tone: 'sky' },
  steal: { title: '偷菜', description: '巡查频率和操作延迟', icon: 'i-carbon-crop-health', image: '/game-config/module_icons/steal.png', tone: 'lime' },
  merchant: { title: '神秘商人', description: '商品购买和货币范围', icon: 'i-carbon-store', image: '/game-config/module_icons/merchant.png', tone: 'orange' },
  activity: { title: '日常与活动', description: '日常任务、活动奖励和活动道具', icon: 'i-carbon-events', image: '/game-config/module_icons/activity-task.png', tone: 'violet' },
}

const activeInfo = computed(() => activeModule.value ? moduleInfo[activeModule.value] : null)
const fertilizerName = computed(() => props.fertilizerOptions.find(item => item.value === automation.value.automation.fertilizer)?.label || '未设置')
const selectedLandNames = computed(() => props.fertilizerLandTypeOptions.filter(item => automation.value.automation.fertilizer_land_types?.includes(item.value)).map(item => item.label))
const selectedLandTypeCount = computed(() => Array.isArray(automation.value.automation.fertilizer_land_types) ? automation.value.automation.fertilizer_land_types.length : 0)
const activityKeys = computed(() => [
  'star_solar_claim',
  ...ranchSettings.map(item => item.key),
  ...(showMuge.value ? mugeSettings.map(item => item.key) : []),
  ...(showMilkTeaActivity.value ? ['mall_coupon_gift_buy', 'milk_tea_cashier', 'milk_tea_wages', 'milk_tea_share_daily', 'milk_tea_share_rewards', 'milk_tea_fund_rewards'] : []),
  ...(showMilkTeaBusiness.value ? ['milk_tea_upgrade', 'milk_tea_craft', 'milk_tea_boost', 'milk_tea_hire', 'milk_tea_seed_buy'] : []),
  ...(showRainPoemActivity.value
    ? ['rain_poem_bottle_buy', 'rain_poem_weather_collect', 'rain_poem_summon_use', 'rain_poem_prank_use', 'rain_poem_research_unlock']
    : []),
  ...(showCharityFlowerActivity.value
    ? ['charity_flower_share_claim', 'charity_flower_donate', 'charity_flower_reward_claim', 'charity_flower_public_fund_claim']
    : []),
  ...(showPetDiaryActivity.value
    ? ['pet_diary_adopt', 'pet_diary_feed', 'pet_diary_draw', 'pet_diary_story_claim', 'pet_diary_seed_claim', 'pet_diary_solar_claim', 'pet_diary_treasure_open', 'pet_diary_compensation_claim', 'pet_diary_charm_equip', 'pet_diary_battle']
    : []),
  ...(showWishSignActivity.value ? ['wish_sign_draw', 'wish_sign_claim'] : []),
  ...(showShareRewardActivity.value ? ['share_reward_share', 'share_reward_daily', 'share_reward_milestones'] : []),
])
const activityEnabledCount = computed(() => activityKeys.value.filter(key => automation.value.automation[key]).length)
const starFestivalEnabled = computed(() => ['star_passport_claim', 'star_record_claim'].some(key => automation.value.automation[key]))
const qixiActivityEnabled = computed(() => ['qixi_dew_use', 'qixi_bridge_build', 'qixi_sachet_gift'].some(key => automation.value.automation[key]))
// 按活动分别判断。此前这里复用 activityKeys（含全部活动），只开公益或萌宠时
// 也会被标成「雨落成诗」，标签会失真。
const rainPoemActivityEnabled = computed(() => ['rain_poem_bottle_buy', 'rain_poem_weather_collect', 'rain_poem_summon_use', 'rain_poem_prank_use', 'rain_poem_research_unlock'].some(key => automation.value.automation[key]))
const charityFlowerActivityEnabled = computed(() => ['charity_flower_share_claim', 'charity_flower_donate', 'charity_flower_reward_claim', 'charity_flower_public_fund_claim'].some(key => automation.value.automation[key]))
const petDiaryActivityEnabled = computed(() => ['pet_diary_adopt', 'pet_diary_feed', 'pet_diary_draw', 'pet_diary_story_claim', 'pet_diary_seed_claim', 'pet_diary_solar_claim', 'pet_diary_treasure_open', 'pet_diary_compensation_claim', 'pet_diary_charm_equip', 'pet_diary_battle'].some(key => automation.value.automation[key]))
const wishSignActivityEnabled = computed(() => ['wish_sign_draw', 'wish_sign_claim'].some(key => automation.value.automation[key]))
const shareRewardActivityEnabled = computed(() => ['share_reward_share', 'share_reward_daily', 'share_reward_milestones'].some(key => automation.value.automation[key]))

function intervalTag(min: number, max: number) {
  return `${min}-${max} 秒`
}

function moduleStateLabel(key: ModuleKey) {
  if (key === 'activity')
    return moduleEnabled(key) ? '已配置' : '未开启'
  return moduleEnabled(key) ? '已开启' : '已关闭'
}

function summaryTags(key: ModuleKey) {
  if (key === 'planting') {
    const primaryStrategy = strategy.value.plantingStrategy
    const hasFallback = primaryStrategy === 'bag_priority' || primaryStrategy === 'task_priority'
    const primaryLabel = props.plantingStrategyOptions.find(option => option.value === primaryStrategy)?.label
    return [
      ...(hasFallback ? [primaryLabel || '未设置策略'] : []),
      hasFallback ? `第二策略：${props.strategyPreviewLabel || '等待选种'}` : props.strategyPreviewLabel || '等待选种',
      automation.value.automation.sell ? '卖果实' : '不卖果实',
      strategy.value.prioritize2x2Crops ? '优先 2x2' : '常规占地',
      `巡田 ${intervalTag(strategy.value.intervals.farmMin, strategy.value.intervals.farmMax)}`,
    ]
  }
  if (key === 'fertilizer') {
    return [
      fertilizerName.value,
      selectedLandNames.value.join('、') || '未选土地',
      automation.value.automation.land_upgrade ? '升级土地' : '不升级',
      automation.value.automation.fertilizer_buy_organic || automation.value.automation.fertilizer_buy_normal ? '自动补肥' : '不补肥',
    ]
  }
  if (key === 'friends') {
    return [
      automation.value.automation.friend_help ? '帮助好友' : '不帮助',
      automation.value.automation.friend_auto_accept ? `自动通过 ${automation.value.autoAcceptFriendMinLevel || 0} 级+` : '不自动通过',
      strategy.value.friendQuietHours?.enabled ? '静默时段' : '无静默',
      `帮助 ${intervalTag(strategy.value.intervals.helpMin, strategy.value.intervals.helpMax)}`,
    ]
  }
  if (key === 'steal') {
    return [
      automation.value.automation.friend_steal ? '偷菜开启' : '偷菜关闭',
      '巡查节奏自动跟随好友作物成熟时间',
    ]
  }
  if (key === 'merchant') {
    const currencies = [
      automation.value.automation.mystery_shop_allow_gold && '金币',
      automation.value.automation.mystery_shop_allow_coupon && '点券',
      automation.value.automation.mystery_shop_allow_gold_bean && '金豆豆',
    ].filter(Boolean)
    return [
      automation.value.automation.mystery_shop_auto_buy ? '自动购买' : '未开启购买',
      currencies.join('、') || '未选货币',
    ]
  }
  return [
    automation.value.automation.task ? '自动完成日常任务' : '不做日常',
    automation.value.automation.star_solar_claim && '节令小札',
    SHOW_STAR_ACTIVITY && starFestivalEnabled.value && '心许千灯星垂野',
    SHOW_QIXI_ACTIVITY && qixiActivityEnabled.value && '鹊桥寄情',
    showRainPoemActivity.value && rainPoemActivityEnabled.value && '雨落成诗',
    showCharityFlowerActivity.value && charityFlowerActivityEnabled.value && '公益小红花',
    showPetDiaryActivity.value && petDiaryActivityEnabled.value && '萌宠成长日记',
    showWishSignActivity.value && wishSignActivityEnabled.value && '秋祈良愿',
    showShareRewardActivity.value && shareRewardActivityEnabled.value && '快乐不独享',
    activityEnabledCount.value === 0 && !starFestivalEnabled.value
    && (!SHOW_QIXI_ACTIVITY || !qixiActivityEnabled.value) && '未开启活动',
  ].filter(Boolean)
}

function moduleEnabled(key: ModuleKey) {
  if (key === 'planting')
    return automation.value.automation.farm
  if (key === 'fertilizer')
    return automation.value.automation.fertilizer !== 'none' || automation.value.automation.land_upgrade
  if (key === 'friends')
    return automation.value.automation.friend
  if (key === 'steal')
    return automation.value.automation.friend && automation.value.automation.friend_steal
  if (key === 'merchant')
    return automation.value.automation.mystery_shop_auto_buy
  return activityEnabledCount.value > 0 || automation.value.automation.task
}

function setModuleEnabled(key: ModuleKey, enabled: boolean) {
  if (key === 'planting') {
    automation.value.automation.farm = enabled
  }
  else if (key === 'fertilizer') {
    automation.value.automation.fertilizer = enabled ? (automation.value.automation.fertilizer === 'none' ? 'normal' : automation.value.automation.fertilizer) : 'none'
  }
  else if (key === 'friends') {
    automation.value.automation.friend = enabled
  }
  else if (key === 'steal') {
    automation.value.automation.friend_steal = enabled
    if (enabled)
      automation.value.automation.friend = true
  }
  else if (key === 'merchant') {
    automation.value.automation.mystery_shop_auto_buy = enabled
  }
  else {
    automation.value.automation.task = enabled
    if (!enabled) {
      automation.value.automation.mall_coupon_gift_buy = false
      activityKeys.value.forEach((activityKey) => {
        automation.value.automation[activityKey] = false
      })
    }
  }
  emit('save', key, true)
}

function isFertilizerLandSelected(value: string | number) {
  return Array.isArray(automation.value.automation.fertilizer_land_types)
    && automation.value.automation.fertilizer_land_types.includes(value)
}

function toggleFertilizerLand(value: string | number) {
  const current = Array.isArray(automation.value.automation.fertilizer_land_types)
    ? automation.value.automation.fertilizer_land_types
    : []
  automation.value.automation.fertilizer_land_types = current.includes(value)
    ? current.filter((item: string | number) => item !== value)
    : [...current, value]
}

function qixiPriority() {
  return Array.isArray(automation.value.automation.qixi_friend_priority) ? automation.value.automation.qixi_friend_priority : []
}
function toggleQixiFriend(gid: number) {
  const list = qixiPriority()
  automation.value.automation.qixi_friend_priority = list.includes(gid) ? list.filter((id: number) => id !== gid) : [...list, gid]
}
function moveQixiFriend(index: number, direction: number) {
  const list = [...qixiPriority()]
  const target = index + direction
  if (target < 0 || target >= list.length) {
    return
  }
  const currentValue = list[index]
  list[index] = list[target]
  list[target] = currentValue
  automation.value.automation.qixi_friend_priority = list
}
function friendName(gid: number) {
  return qixiFriends.value.find(item => item.gid === gid)?.name || `好友 ${gid}`
}
async function loadQixiFriends() {
  if (!props.currentAccountId)
    return
  try {
    const { data } = await api.get('/api/activity/qixi', { headers: { 'x-account-id': props.currentAccountId } })
    qixiFriends.value = data?.friends || []
  }
  catch { qixiFriends.value = [] }
}
function finish() {
  if (!activeModule.value)
    return
  emit('save', activeModule.value, true)
  editSnapshot.value = null
  activeModule.value = null
}
function openModule(key: ModuleKey) {
  editSnapshot.value = {
    strategy: JSON.parse(JSON.stringify(strategy.value)),
    automation: JSON.parse(JSON.stringify(automation.value)),
  }
  activeModule.value = key
}
function cancel() {
  if (editSnapshot.value) {
    strategy.value = editSnapshot.value.strategy
    automation.value = editSnapshot.value.automation
  }
  editSnapshot.value = null
  activeModule.value = null
}
onMounted(() => {
  loadQixiFriends()
  void loadMugeWindow()
  nowTimer = window.setInterval(() => {
    nowMs.value = Date.now()
    void loadMugeWindow()
  }, 60000)
})
onUnmounted(() => {
  if (nowTimer)
    window.clearInterval(nowTimer)
})
watch(() => props.currentAccountId, () => {
  loadQixiFriends()
  void loadMugeWindow()
})
</script>

<template>
  <div class="space-y-5">
    <div v-if="loading" class="py-12 text-center text-gray-500">
      <span class="i-svg-spinners-ring-resize mb-2 inline-block text-2xl" /><div>加载中...</div>
    </div>
    <div v-else-if="!currentAccountId" class="py-12 text-center text-gray-500">
      请先选择账号
    </div>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span class="text-gray-700 font-medium dark:text-gray-300">账号设置</span>
        <span class="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        <span>{{ currentAccountName ? `正在配置：${currentAccountName}` : '请先在账号管理中选择账号' }}</span>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="(info, key) in moduleInfo"
          :key="key"
          class="group min-h-[184px] flex flex-col border border-gray-200 rounded-lg bg-white p-4 transition dark:border-gray-700 hover:border-[var(--theme-primary)] dark:bg-gray-800 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex items-center gap-3">
              <img v-if="info.image" :src="info.image" alt="" class="h-10 w-10 shrink-0 rounded-lg bg-gray-100 object-contain p-1.5 dark:bg-gray-700">
              <span v-else class="inline-grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl dark:bg-gray-700" :class="info.icon" /><div>
                <h4 class="text-gray-900 font-semibold dark:text-gray-100">
                  {{ info.title }}
                </h4><p class="mt-0.5 text-xs text-gray-500">
                  {{ info.description }}
                </p>
              </div>
            </div>
            <BaseSwitch
              :aria-label="`${info.title}自动化`"
              :model-value="moduleEnabled(key as ModuleKey)"
              :disabled="saving"
              @update:model-value="setModuleEnabled(key as ModuleKey, !!$event)"
            />
          </div>

          <div class="mt-4 min-h-[56px] flex flex-wrap content-start gap-2">
            <span
              v-for="tag in summaryTags(key as ModuleKey)"
              :key="tag"
              class="max-w-full truncate rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300"
            >
              {{ tag }}
            </span>
          </div>

          <div class="mt-auto flex items-center justify-between pt-4">
            <span class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span class="h-2 w-2 rounded-full" :class="moduleEnabled(key as ModuleKey) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'" />
              {{ moduleStateLabel(key as ModuleKey) }}
            </span>
            <BaseButton variant="secondary" size="sm" @click="openModule(key as ModuleKey)">
              配置
            </BaseButton>
          </div>
        </article>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="activeModule && activeInfo" class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-gray-950/45 p-3 backdrop-blur-[2px] sm:p-6" @click.self="cancel">
        <section class="max-h-[94vh] max-w-4xl w-full flex flex-col overflow-hidden border border-gray-200 rounded-lg bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <header class="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:px-6">
            <div class="min-w-0 flex items-start gap-3">
              <img v-if="activeInfo.image" :src="activeInfo.image" alt="" class="h-11 w-11 shrink-0 rounded-lg bg-gray-100 object-contain p-1.5 dark:bg-gray-700">
              <span v-else class="inline-grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl dark:bg-gray-700" :class="activeInfo.icon" />
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg text-gray-900 font-semibold dark:text-gray-100">
                    {{ activeInfo.title }}
                  </h3>
                  <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {{ moduleStateLabel(activeModule as ModuleKey) }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-gray-500">
                  {{ activeInfo.description }}
                </p>
              </div>
            </div>
            <button class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" @click="cancel">
              <span class="i-carbon-close text-xl" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div class="mb-5 flex flex-wrap gap-2">
              <span
                v-for="tag in summaryTags(activeModule as ModuleKey)"
                :key="tag"
                class="max-w-full truncate rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-900/40 dark:text-gray-300"
              >
                {{ tag }}
              </span>
            </div>

            <div v-if="activeModule === 'planting'" class="space-y-4">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  基础功能
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="strategy.prioritize2x2Crops" label="优先种植 2×2 作物" />
                  <BaseSwitch v-model="automation.automation.sell" label="卖果实" />
                  <BaseSwitch v-model="automation.automation.golden_bug_clear" label="祛除黄金虫" />
                  <BaseSwitch v-model="automation.automation.farm_push" label="推送触发巡田" />
                  <BaseSwitch v-model="automation.automation.skip_own_weed_bug" label="保留自己农场的草虫" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 dark:border-gray-700">
                <StrategySettingsTab
                  v-model:settings="strategy"
                  :current-account-name="null"
                  :current-account-id="currentAccountId"
                  :loading="false"
                  :saving="saving"
                  :show-actions="false"
                  timing-section="planting"
                  title="选种策略与巡田频率"
                  :planting-strategy-options="plantingStrategyOptions"
                  :bag-fallback-strategy-options="bagFallbackStrategyOptions"
                  :strategy-preview-label="strategyPreviewLabel"
                />
              </section>
            </div>

            <div v-else-if="activeModule === 'fertilizer'" class="space-y-5">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  基础功能
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.land_upgrade" label="升级土地" />
                  <BaseSwitch v-model="automation.automation.fertilizer_gift" label="填充化肥" />
                  <BaseSwitch v-model="automation.automation.fertilizer_buy_organic" label="购买有机肥" />
                  <BaseSwitch v-model="automation.automation.fertilizer_buy_normal" label="购买无机肥" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    施肥范围
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    已选 {{ selectedLandTypeCount }}/{{ fertilizerLandTypeOptions.length }}
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 lg:grid-cols-5">
                  <button
                    v-for="option in fertilizerLandTypeOptions"
                    :key="option.value"
                    type="button"
                    class="min-h-11 flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-left text-sm transition"
                    :class="isFertilizerLandSelected(option.value)
                      ? 'border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)] text-gray-900 shadow-sm dark:text-gray-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700/60'"
                    @click="toggleFertilizerLand(option.value)"
                  >
                    <span class="truncate font-medium">{{ option.label }}</span>
                    <span
                      class="grid h-5 w-5 shrink-0 place-items-center border rounded-full text-xs transition"
                      :class="isFertilizerLandSelected(option.value)
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white'
                        : 'border-gray-300 text-transparent dark:border-gray-600'"
                    >
                      <span class="i-carbon-checkmark text-sm" />
                    </span>
                  </button>
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSelect v-model="automation.automation.fertilizer" label="施肥策略" :options="fertilizerOptions" />
                  <BaseInput v-if="['smart', 'smart_only', 'smart_normal'].includes(automation.automation.fertilizer)" v-model.number="automation.automation.fertilizer_smart_seconds" label="快成熟判定秒数" type="number" min="30" max="3600" />
                </div>
                <BaseSwitch v-model="automation.automation.fertilizer_multi_season" label="多季补肥" />
              </section>

              <section v-if="automation.automation.fertilizer_buy_organic || automation.automation.fertilizer_buy_normal" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm font-medium">
                  自动补肥参数
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-if="automation.automation.fertilizer_buy_organic" v-model.number="automation.fertilizerBuyOrganicCount" label="有机肥购买数量" type="number" min="1" />
                  <BaseInput v-if="automation.automation.fertilizer_buy_organic" v-model.number="automation.fertilizerBuyOrganicThresholdHours" label="有机肥触发阈值（小时）" type="number" min="1" />
                  <BaseInput v-if="automation.automation.fertilizer_buy_normal" v-model.number="automation.fertilizerBuyNormalCount" label="无机肥购买数量" type="number" min="1" />
                  <BaseInput v-if="automation.automation.fertilizer_buy_normal" v-model.number="automation.fertilizerBuyNormalThresholdHours" label="无机肥触发阈值（小时）" type="number" min="1" />
                  <BaseInput v-model.number="automation.fertilizerBuyCheckIntervalMinutes" label="检测间隔（分钟）" type="number" min="1" />
                </div>
              </section>
            </div>

            <div v-else-if="activeModule === 'friends'" class="space-y-5">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  好友互动
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.friend_help" label="帮助好友" />
                  <BaseSwitch v-model="automation.automation.friend_bad" label="好友捣乱" />
                  <BaseSwitch v-model="automation.automation.friend_golden_bug" label="放黄金虫" />
                  <BaseSwitch v-model="automation.automation.friend_help_exp_limit" label="经验满只帮护主犬" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  好友申请
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.friend_auto_accept" label="自动通过好友申请" />
                  <BaseInput v-if="automation.automation.friend_auto_accept" v-model.number="automation.autoAcceptFriendMinLevel" label="自动通过好友最低等级" type="number" min="0" max="200" />
                </div>
              </section>

              <section v-if="automation.automation.friend_golden_bug" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  黄金虫策略
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseInput v-model.number="automation.goldenBugKeepCount" label="黄金虫保留数量" type="number" min="0" />
                  <BaseInput v-model.number="automation.goldenBugRoundLimit" label="黄金虫单轮上限" type="number" min="1" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 dark:border-gray-700">
                <StrategyTimingPanel v-model:settings="strategy" section="friends" />
              </section>
            </div>
            <div v-else-if="activeModule === 'steal'" class="space-y-5">
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-2 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  巡查节奏说明
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  偷菜巡查不再使用固定的巡查间隔或延迟设置。系统会根据已知好友农场的作物成熟时间动态计算下一次巡查的时机，成熟越近巡查越勤，避免固定间隔造成的空跑或错过窗口。开启右上角的开关即可自动运行。
                </p>
              </section>
            </div>

            <div v-else-if="activeModule === 'merchant'" class="space-y-4">
              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div>
                  <div class="mb-2 text-sm text-gray-700 font-medium dark:text-gray-300">
                    允许使用的货币
                  </div>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_gold" label="金币" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_coupon" label="点券" />
                    <BaseSwitch v-model="automation.automation.mystery_shop_allow_gold_bean" label="金豆豆" />
                  </div>
                </div>
              </section>
            </div>

            <div v-else class="space-y-4">
              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <h3 class="text-sm font-medium">
                  牧场
                </h3>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-for="item in ranchSettings" :key="item.key" v-model="automation.automation[item.key]" :label="item.label" />
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="text-sm">养殖策略<select v-model="automation.automation.ranch_strategy" class="mt-1 w-full border rounded bg-transparent p-2"><option value="level">当前等级优先</option><option value="preferred">指定动物</option><option value="bag_priority">优先使用背包幼崽</option></select></label>
                  <template v-if="automation.automation.ranch_strategy === 'preferred'">
                    <label class="text-sm">窝<select v-model.number="automation.automation.ranch_coop_animal" class="mt-1 w-full border rounded bg-transparent p-2"><option :value="0">请选择</option><option v-for="animal in ranchAnimals.filter(a => a.kind === '窝')" :key="animal.value" :value="animal.value">{{ animal.label }}</option></select></label><label class="text-sm">棚<select v-model.number="automation.automation.ranch_shed_animal" class="mt-1 w-full border rounded bg-transparent p-2"><option :value="0">请选择</option><option v-for="animal in ranchAnimals.filter(a => a.kind === '棚')" :key="animal.value" :value="animal.value">{{ animal.label }}</option></select></label>
                  </template>
                  <label class="text-sm">普通罐头使用时机<select v-model="automation.automation.ranch_feed_normal_stage" class="mt-1 w-full border rounded bg-transparent p-2"><option v-for="opt in ranchFeedStageOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
                  <label class="text-sm">有机罐头使用时机<select v-model="automation.automation.ranch_feed_organic_stage" class="mt-1 w-full border rounded bg-transparent p-2"><option v-for="opt in ranchFeedStageOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
                  <label class="text-sm">巡查间隔（分钟）<input v-model.number="automation.automation.ranch_check_minutes" type="number" min="1" max="60" class="mt-1 w-full border rounded bg-transparent p-2"></label>
                  <label class="text-sm">牧草补充阈值（%）<input v-model.number="automation.automation.ranch_grass_threshold_percent" type="number" min="1" max="100" class="mt-1 w-full border rounded bg-transparent p-2"></label>
                </div>
              </section>
              <section v-if="showMuge" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <h3 class="text-sm font-medium">
                  牧歌初启
                </h3><div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-for="item in mugeSettings" :key="item.key" v-model="automation.automation[item.key]" :label="item.label" />
                </div>
              </section>
              <section class="border border-gray-100 rounded-lg bg-gray-50/70 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900/25">
                <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                  日常任务
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.task" label="自动完成日常任务" />
                </div>
              </section>

              <section class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <h3 class="text-sm font-medium">
                  节令小札
                </h3>
                <BaseSwitch v-model="automation.automation.star_solar_claim" label="自动领取节令奖励" />
              </section>

              <section v-if="SHOW_STAR_ACTIVITY" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div>
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    心许千灯星垂野
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    千星游记与观星礼录领取
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.star_passport_claim" label="领取千星游记" />
                  <BaseSwitch v-model="automation.automation.star_record_claim" label="领取观星礼录" />
                </div>
              </section>

              <section v-if="SHOW_QIXI_ACTIVITY" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div>
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    鹊桥寄情
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    灵露、鹊桥与香囊赠送
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.qixi_dew_use" label="使用鹊羽灵露" />
                  <BaseSwitch v-model="automation.automation.qixi_bridge_build" label="驻建鹊桥" />
                  <BaseSwitch v-model="automation.automation.qixi_sachet_gift" label="赠送鹊羽香囊" />
                </div>

                <div v-if="automation.automation.qixi_sachet_gift" class="border-t border-gray-100 pt-3 space-y-3 dark:border-gray-700">
                  <div class="text-sm font-medium">
                    香囊好友优先级
                  </div>
                  <div v-for="(gid, index) in qixiPriority()" :key="gid" class="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40">
                    <span class="w-6 text-gray-400">{{ Number(index) + 1 }}</span>
                    <span class="flex-1">{{ friendName(Number(gid)) }}</span>
                    <button :disabled="Number(index) === 0" @click="moveQixiFriend(Number(index), -1)">
                      ↑
                    </button>
                    <button :disabled="Number(index) === qixiPriority().length - 1" @click="moveQixiFriend(Number(index), 1)">
                      ↓
                    </button>
                    <button class="text-red-500" @click="toggleQixiFriend(Number(gid))">
                      ×
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button v-for="friend in qixiFriends.filter(item => !qixiPriority().includes(item.gid))" :key="friend.gid" class="border rounded-full px-3 py-1.5 text-xs" @click="toggleQixiFriend(friend.gid)">
                      + {{ friend.name }}
                    </button>
                  </div>
                </div>
              </section>

              <section v-if="showRainPoemActivity" class="border border-gray-100 rounded-lg p-4 space-y-3 dark:border-gray-700">
                <div>
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    雨落成诗
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    天气采集、雷雨召唤与气象研究
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.rain_poem_bottle_buy" label="购买天气采集瓶" />
                  <BaseSwitch v-model="automation.automation.rain_poem_weather_collect" label="采集好友雷雨" />
                  <BaseSwitch v-model="automation.automation.rain_poem_summon_use" label="使用雷雨召唤瓶" />
                  <BaseSwitch v-model="automation.automation.rain_poem_prank_use" label="使用青蛙与乌云使坏瓶" />
                  <BaseSwitch v-model="automation.automation.rain_poem_research_unlock" label="解锁气象研究" />
                </div>
              </section>

              <section v-if="showCharityFlowerActivity" class="border border-rose-100 rounded-lg p-4 space-y-3 dark:border-rose-900/40">
                <div>
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    公益小红花
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    分享奖励、爱心捐赠、档位奖励与公益金
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.charity_flower_share_claim" label="领取每日分享奖励" />
                  <BaseSwitch v-model="automation.automation.charity_flower_donate" label="送出全部爱心" />
                  <BaseSwitch v-model="automation.automation.charity_flower_reward_claim" label="领取爱心档位奖励" />
                  <BaseSwitch v-model="automation.automation.charity_flower_public_fund_claim" label="领取并送出 1 元公益金" />
                </div>
                <p class="text-xs text-amber-600 dark:text-amber-400">
                  该开关会执行真实的 1 元公益助力，每个角色活动期仅一次；仅在官方状态可领取且账号已同意腾讯公益平台协议时执行。
                </p>
              </section>

              <section v-if="showWishSignActivity" class="border border-amber-100 rounded-lg p-4 space-y-3 dark:border-amber-900/40">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                      秋祈良愿
                    </div>
                    <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      每日祈愿和领取好运奖励。烟花可在个人背包使用。
                    </div>
                  </div>
                  <span class="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">2026-09-24 00:00 — 2026-10-07 23:59</span>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.wish_sign_draw" label="自动祈愿" />
                  <BaseSwitch v-model="automation.automation.wish_sign_claim" label="自动领取祈愿奖励" />
                </div>
                <BaseSelect
                  v-model="automation.automation.wish_sign_choice" label="自动祈愿方向" :options="[
                    { label: '财运', value: 1 }, { label: '感情', value: 2 }, { label: '前程', value: 3 },
                    { label: '生活', value: 4 }, { label: '农耕', value: 5 }, { label: '人际', value: 6 },
                  ]"
                />
              </section>

              <section v-if="showShareRewardActivity" class="border border-orange-100 rounded-lg p-4 space-y-3 dark:border-orange-900/40">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                      快乐不独享
                    </div>
                    <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      自动分享领取首次分享快乐值，无需好友点击；自动领取每日快乐值和已达成的档位奖励。
                    </div>
                  </div>
                  <span class="rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">2026-09-24 00:00 — 2026-10-12 23:59</span>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.share_reward_share" label="自动分享" />
                  <BaseSwitch v-model="automation.automation.share_reward_daily" label="自动领取每日快乐值" />
                  <BaseSwitch v-model="automation.automation.share_reward_milestones" label="自动领取档位奖励" />
                </div>
              </section>

              <section v-if="showMilkTeaActivity" class="border border-amber-200 rounded-xl bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/10">
                <h3 class="mb-4 text-sm text-gray-900 font-semibold dark:text-gray-100">
                  奶茶热销中
                </h3>
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div v-for="setting in milkTeaSettings" :key="setting.key" class="min-w-0 flex items-center justify-between gap-4 border border-amber-100 rounded-lg bg-white/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
                    <div class="min-w-0">
                      <div :id="`milk-tea-setting-${setting.key}`" class="text-sm text-gray-800 font-medium leading-5 dark:text-gray-200">
                        {{ setting.label }}
                      </div>
                      <p class="mt-1 text-xs text-gray-500 leading-5 dark:text-gray-400">
                        {{ setting.detail }}
                      </p>
                    </div>
                    <BaseSwitch v-model="automation.automation[setting.key]" class="shrink-0" :aria-labelledby="`milk-tea-setting-${setting.key}`" />
                  </div>
                </div>
                <div v-if="showMilkTeaBusiness" class="grid mt-3 gap-3 sm:grid-cols-2">
                  <label class="text-sm">雇佣时长
                    <select v-model.number="automation.automation.milk_tea_hire_duration" class="mt-1 w-full border rounded p-2 dark:bg-gray-900">
                      <option :value="1">4 小时</option><option :value="2">12 小时</option><option :value="3">24 小时</option>
                    </select>
                  </label>
                  <label class="text-sm">雇佣类型
                    <select v-model.number="automation.automation.milk_tea_hire_talent" class="mt-1 w-full border rounded p-2 dark:bg-gray-900">
                      <option :value="0">任意好友</option><option :value="9001">金牌销售</option><option :value="9002">金牌宣传</option><option :value="9003">金牌服务</option><option :value="9004">实习员工（默默搬砖）</option>
                    </select>
                  </label>
                </div>
                <p v-if="showMilkTeaBusiness" class="mt-2 text-xs text-gray-500">
                  指定类型无空闲好友时，依次选择其他空闲好友、实习员工；均不可用则等待下次检查。时长或奶茶券不足时跳过。
                </p>
              </section>
              <section v-if="showPetDiaryActivity" class="border border-violet-100 rounded-lg p-4 space-y-3 dark:border-violet-900/40">
                <div>
                  <div class="text-sm text-gray-700 font-medium dark:text-gray-300">
                    萌宠成长日记
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    比熊养成、爪印手记、宝藏护送与节令赠礼
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseSwitch v-model="automation.automation.pet_diary_adopt" label="领养并领取比熊" />
                  <BaseSwitch v-model="automation.automation.pet_diary_feed" label="自动投喂（每日 16 次）" />
                  <BaseSwitch v-model="automation.automation.pet_diary_draw" label="自动寻宝（每日 10 次）" />
                  <BaseSwitch v-model="automation.automation.pet_diary_story_claim" label="领取爪印手记奖励" />
                  <BaseSwitch v-model="automation.automation.pet_diary_seed_claim" label="领取活动种子礼包" />
                  <BaseSwitch v-model="automation.automation.pet_diary_solar_claim" label="领取节令赠礼" />
                  <BaseSwitch v-model="automation.automation.pet_diary_treasure_open" label="护送完成后开启宝藏" />
                  <BaseSwitch v-model="automation.automation.pet_diary_compensation_claim" label="领取夺宝补偿" />
                  <BaseSwitch v-model="automation.automation.pet_diary_battle" label="自动好友夺宝" />
                  <BaseSwitch v-model="automation.automation.pet_diary_charm_equip" label="自动选择锦囊（含免费刷新）" />
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  投喂与寻宝消耗萌宠元气糕，元气糕来自收获活动作物，元气糕不足时自动跳过。锦囊只使用每日免费刷新额度，不消耗点券或钻石。
                </p>
                <p class="text-xs text-amber-600 dark:text-amber-400">
                  自动夺宝轮转检查好友并跳过好友黑名单，按初级、中级、高级顺序使用宝藏允许的已有挑战书，不自动购买。拾物小铺兑换仍需手动选择商品。
                </p>
              </section>
            </div>
          </div>
          <footer class="flex justify-end gap-2 border-t bg-gray-50/70 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/20 sm:px-6">
            <BaseButton variant="secondary" size="sm" @click="cancel">
              取消
            </BaseButton>
            <BaseButton size="sm" :loading="saving" @click="finish">
              保存并关闭
            </BaseButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>
