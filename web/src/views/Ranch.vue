<script setup lang="ts">
import type { RanchQuote } from '@/stores/ranch'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useRanchStore } from '@/stores/ranch'

const account = useAccountStore()
const store = useRanchStore()
const view = ref('animals')
const shopId = ref(5)
const hostGid = ref<string | undefined>()
const quantities = ref<Record<string, number>>({})
const destinations = ref<Record<string, string>>({})
const pending = ref<{ action: string, input: Record<string, unknown>, quote: RanchQuote } | null>(null)
const tabs = [
  { id: 'overview', label: '生涯' },
  { id: 'animals', label: '动物' },
  { id: 'facilities', label: '设施' },
  { id: 'bag', label: '背包' },
  { id: 'shop', label: '商店' },
  { id: 'market', label: '仓鼠集市' },
  { id: 'cans', label: '罐头商城' },
  { id: 'tasks', label: '每日任务' },
  { id: 'illustrated', label: '图鉴' },
  { id: 'friends', label: '好友' },
]
const disabled = computed(() => store.loading || store.busy || store.uncertain || !store.state?.unlocked)
const goods = computed<any[]>(() => view.value === 'shop' ? store.state?.shop?.goods || [] : view.value === 'market' ? store.state?.market?.goods || [] : store.state?.canShop?.goods || [])
const confirmation = computed(() => pending.value ? [pending.value.quote.message, pending.value.quote.costItems.length ? `消耗：${pending.value.quote.costItems.map(x => `${x.name} ×${x.count}`).join('、')}` : '无需消耗物品', pending.value.quote.rewards.length ? `获得：${pending.value.quote.rewards.map(x => `${x.name} ×${x.count}`).join('、')}` : ''].filter(Boolean).join('\n') : '')
let mounted = false
let timer: ReturnType<typeof setTimeout> | undefined
const date = (value: number) => value > 0 ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value < 1e12 ? value * 1000 : value) : '—'
function formatSeconds(raw: unknown) {
  const sec = Math.max(0, Number(raw) || 0)
  if (sec < 60)
    return `${sec}秒`
  const hours = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  return hours > 0 ? `${hours}时${mins}分` : `${mins}分`
}
const bucketSeconds = (id: number) => store.state?.buckets?.find((b: any) => Number(b.id) === id)?.seconds ?? '0'
const quantity = (id: string) => Math.max(1, Math.floor(Number(quantities.value[id]) || 1))
function canBuy(good: any) {
  if (!good.available || good.price?.id === 1004)
    return false
  try {
    return good.free || (good.price?.balance != null && BigInt(good.price.balance) >= BigInt(good.price.count) * BigInt(quantity(good.id)))
  }
  catch {
    return false
  }
}
function schedule() {
  clearTimeout(timer)
  if (mounted && document.visibilityState === 'visible' && account.currentAccountId)
    timer = setTimeout(refresh, 30000)
}
async function refresh() {
  await store.load({ view: view.value, shopId: view.value === 'cans' ? 6 : shopId.value, hostGid: hostGid.value })
  schedule()
}
function visibility() {
  clearTimeout(timer)
  if (document.visibilityState === 'visible')
    void refresh()
}
async function prepare(action: string, input: Record<string, unknown> = {}) {
  const quote = await store.quote(action, input)
  if (quote && !quote.skipped)
    pending.value = { action, input, quote }
  else if (quote)
    store.notice = quote.message || '当前没有可操作项目'
}
async function confirm() {
  const current = pending.value
  if (!current)
    return
  await store.execute(current.action, { ...current.input, expected: current.quote.expected })
  pending.value = null
}
async function visit(gid: string) {
  hostGid.value = gid
  await refresh()
}
async function toggleBlacklist(gid: string) {
  await store.toggleFriendBlacklist(gid)
}
watch(view, () => {
  hostGid.value = undefined
  pending.value = null
  void refresh()
})
watch(() => account.currentAccountId, () => {
  hostGid.value = undefined
  quantities.value = {}
  pending.value = null
  void refresh()
})
onMounted(() => {
  mounted = true
  document.addEventListener('visibilitychange', visibility)
  void refresh()
})
onUnmounted(() => {
  mounted = false
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', visibility)
})
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">
          牧场
        </h1>
        <p class="text-sm text-gray-500">
          {{ account.currentAccount?.name || '未选择账号' }}<span v-if="store.state?.unlocked"> · Lv.{{ store.state.level }} · 经验 {{ store.state.currentExp }}/{{ store.state.neededExp ?? '满级' }}</span>
        </p>
      </div>
      <BaseButton :disabled="!account.currentAccountId || store.busy" :loading="store.loading" @click="refresh">
        刷新
      </BaseButton>
    </header>
    <nav class="flex gap-2 overflow-x-auto pb-1">
      <BaseButton v-for="tab in tabs" :key="tab.id" size="sm" :variant="tab.id === view ? 'primary' : 'secondary'" :disabled="store.busy || store.loading" @click="view = tab.id">
        {{ tab.label }}
      </BaseButton>
    </nav>
    <p v-if="!account.currentAccountId" class="rounded-lg bg-white p-8 text-center dark:bg-gray-800">
      请选择账号
    </p>
    <p v-if="store.error" role="alert" class="rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      {{ store.error }}
    </p>
    <p v-if="store.notice" role="status" class="rounded-lg bg-green-50 p-3 text-green-800 dark:bg-green-900/30 dark:text-green-200">
      {{ store.notice }}
    </p>
    <p v-if="store.loading && !store.state" class="p-8 text-center">
      正在读取牧场…
    </p>
    <p v-else-if="store.state && !store.state.unlocked" class="rounded-lg bg-white p-8 text-center dark:bg-gray-800">
      {{ store.state.reason }}
    </p>
    <template v-if="store.state?.unlocked">
      <div class="grid grid-cols-2 gap-2 lg:grid-cols-8 sm:grid-cols-4">
        <div v-for="item in store.state.currencies" :key="item.id" class="flex items-center gap-2 rounded-lg bg-white p-3 dark:bg-gray-800">
          <img v-if="item.image" :src="item.image" alt="" class="h-8 w-8 shrink-0 object-contain">
          <div class="min-w-0 text-xs sm:text-sm">
            <p class="truncate text-gray-500 dark:text-gray-400">
              {{ item.name }}
            </p>
            <strong class="block truncate">{{ item.count }}</strong>
          </div>
        </div>
        <div class="rounded-lg bg-white p-3 text-xs dark:bg-gray-800 sm:text-sm">
          <p class="text-gray-500 dark:text-gray-400">
            牧草
          </p>
          <strong>{{ store.state.grass }}</strong>
        </div>
        <div class="rounded-lg bg-white p-3 text-xs dark:bg-gray-800 sm:text-sm">
          <p class="text-gray-500 dark:text-gray-400">
            普通/有机罐头
          </p>
          <strong>{{ formatSeconds(bucketSeconds(7003)) }} / {{ formatSeconds(bucketSeconds(7004)) }}</strong>
        </div>
        <div class="rounded-lg bg-white p-3 text-xs dark:bg-gray-800 sm:text-sm">
          <p class="text-gray-500 dark:text-gray-400">
            沙漏时长
          </p>
          <strong>{{ formatSeconds(store.state.hourglassSeconds) }}</strong>
        </div>
      </div>

      <div v-for="operation in store.state.pendingOperations" :key="operation.id" class="border border-amber-300 rounded-lg p-3">
        <p class="font-medium">
          {{ operation.label }} · 结果待核对
        </p>
        <p class="text-sm">
          {{ operation.message }}
        </p>
        <BaseButton size="sm" variant="secondary" :disabled="disabled" @click="store.execute('acknowledge', { id: operation.id })">
          已核对结果，解除预留
        </BaseButton>
      </div>

      <template v-if="view === 'overview'">
        <div v-if="store.state.career" class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-white p-4 dark:bg-gray-800">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                累计收获
              </p>
              <strong class="text-lg">{{ store.state.career.totalHarvestCount }}</strong>
            </div>
            <div class="rounded-lg bg-white p-4 dark:bg-gray-800">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                累计成熟
              </p>
              <strong class="text-lg">{{ store.state.career.totalMatureCount }}</strong>
            </div>
            <div class="rounded-lg bg-white p-4 dark:bg-gray-800">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                累计偷取
              </p>
              <strong class="text-lg">{{ store.state.career.totalStealCount }}</strong>
            </div>
          </div>
          <div v-if="store.state.career.products?.length" class="grid grid-cols-2 gap-2 lg:grid-cols-5 sm:grid-cols-3">
            <article v-for="prod in store.state.career.products" :key="prod.id" class="flex items-center gap-2 rounded-lg bg-white p-3 dark:bg-gray-800">
              <img v-if="prod.image" :src="prod.image" alt="" class="h-10 w-10 shrink-0 object-contain">
              <div class="min-w-0 text-sm">
                <p class="truncate font-medium">
                  {{ prod.name }}
                </p>
                <p class="text-xs text-gray-500">
                  ×{{ prod.count }}
                </p>
              </div>
            </article>
          </div>
        </div>
        <p v-else class="rounded-lg bg-white p-6 text-center text-gray-500 dark:bg-gray-800">
          暂无牧场生涯数据
        </p>
      </template>

      <template v-else-if="view === 'animals' || view === 'facilities'">
        <div v-if="view === 'animals'" class="flex flex-wrap gap-2">
          <BaseButton :disabled="disabled" @click="prepare('harvest', { all: true })">
            一键收获
          </BaseButton>
          <BaseButton :disabled="disabled" @click="prepare('produce', { all: true })">
            一键生产
          </BaseButton>
          <BaseButton variant="secondary" :disabled="disabled" @click="prepare('clean')">
            清理牧场
          </BaseButton>
          <BaseButton variant="secondary" :disabled="disabled" @click="prepare('feed', { all: true, bucketType: 2 })">
            普通罐头喂养
          </BaseButton>
          <BaseButton variant="secondary" :disabled="disabled" @click="prepare('feed', { all: true, bucketType: 1 })">
            有机罐头喂养
          </BaseButton>
        </div>
        <article v-for="facility in store.state.facilities" :key="facility.id" class="rounded-lg bg-white p-4 dark:bg-gray-800">
          <header class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">
              {{ facility.name }} · Lv.{{ facility.level }} <span v-if="facility.ranch" class="text-sm font-normal">{{ facility.ranch.count }}/{{ facility.ranch.capacity }}</span>
            </h2>
            <span v-if="facility.upgradeState" class="text-sm">升级结束 {{ date(facility.upgradeEndTime) }}</span>
          </header>
          <div v-if="view === 'facilities'" class="mt-3 flex flex-wrap items-center gap-2">
            <span v-if="facility.next" class="text-sm">下一级：{{ facility.next.level }} · 需要等级 {{ facility.next.requiredLevel ?? '待确认' }}</span>
            <BaseButton v-if="facility.next?.available" size="sm" :disabled="disabled" @click="prepare('upgrade', { facilityId: facility.id })">
              升级
            </BaseButton>
            <template v-if="facility.upgradeState === 1 && Number(store.state.hourglassSeconds) > 0">
              <input v-model.number="quantities[`speed_${facility.id}`]" type="number" min="1" :max="Number(store.state.hourglassSeconds)" placeholder="秒数" class="w-24 border rounded bg-transparent p-1.5 text-sm">
              <BaseButton size="sm" variant="secondary" :disabled="disabled" @click="prepare('speedUpUpgrade', { facilityId: facility.id, seconds: quantity(`speed_${facility.id}`) })">
                沙漏加速
              </BaseButton>
            </template>
            <BaseButton v-if="facility.upgradeState" size="sm" :disabled="disabled" @click="prepare('completeUpgrade', { facilityId: facility.id })">
              完成升级
            </BaseButton>
            <BaseButton v-if="facility.canActivate || (facility.state === 3 && facility.moduleType === 7)" size="sm" :disabled="disabled" @click="prepare('activateShed', { facilityId: facility.id })">
              解锁棚
            </BaseButton>
          </div>
          <div v-if="facility.feed" class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>牧草 {{ facility.feed.count }}/{{ facility.capacity }} · 剩余 {{ formatSeconds(facility.feed.remainingSec) }}</span>
            <input v-model.number="quantities[facility.id]" type="number" min="1" :max="facility.capacity - facility.feed.count" class="w-24 border rounded bg-transparent p-2">
            <BaseButton size="sm" :disabled="disabled" @click="prepare('addGrass', { facilityId: facility.id, count: quantity(facility.id) })">
              补充牧草
            </BaseButton>
          </div>
          <div v-if="view === 'animals'" class="grid mt-3 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div v-for="animal in facility.ranch?.animals" :key="animal.id" class="border border-gray-100 rounded-lg p-3 dark:border-gray-700">
              <div class="flex gap-3">
                <img v-if="animal.image" :src="animal.image" alt="" class="h-16 w-16 object-contain">
                <div class="min-w-0">
                  <strong>{{ animal.name }}</strong>
                  <p class="text-sm">
                    {{ animal.stageName }}
                  </p>
                  <p v-if="animal.nextAtMs" class="text-xs text-gray-500">
                    {{ date(animal.nextAtMs) }}
                  </p>
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <BaseButton v-if="animal.canHarvest" size="sm" :disabled="disabled" @click="prepare('harvest', { ranchId: facility.id, animalId: animal.id })">
                  收获
                </BaseButton>
                <BaseButton v-if="animal.canProduce" size="sm" :disabled="disabled" @click="prepare('produce', { ranchId: facility.id, animalId: animal.id })">
                  生产
                </BaseButton>
                <BaseButton v-if="animal.canRelease" size="sm" variant="secondary" :disabled="disabled" @click="prepare('release', { ranchId: facility.id, animalId: animal.id })">
                  放生
                </BaseButton>
              </div>
            </div>
          </div>
          <p v-if="facility.ranch && !facility.ranch.animals.length" class="mt-3 text-sm text-gray-500">
            暂无动物
          </p>
        </article>
      </template>

      <template v-else-if="view === 'shop' || view === 'market' || view === 'cans'">
        <div v-if="view === 'shop'" class="flex gap-2">
          <BaseButton size="sm" :disabled="disabled" @click="shopId = 5; refresh()">
            幼崽
          </BaseButton>
          <BaseButton size="sm" :disabled="disabled" @click="shopId = 6; refresh()">
            牧草与道具
          </BaseButton>
        </div>
        <p v-if="view === 'market' && (!store.state.market?.opened || !store.state.market?.present)" class="p-4">
          仓鼠集市暂未到访
        </p>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="good in goods" :key="good.id" class="rounded-lg bg-white p-4 dark:bg-gray-800">
            <div class="flex items-center gap-3">
              <img v-if="good.reward?.image" :src="good.reward.image" alt="" class="h-16 w-16 object-contain">
              <strong class="min-w-0 break-words">{{ good.name || good.reward?.name }} ×{{ good.reward?.count }}</strong>
            </div>
            <p class="my-2 text-sm">
              {{ good.free ? '免费' : `${good.price?.name} ×${good.price?.count}` }} · 剩余 {{ good.remaining ?? '不限' }}<span v-if="good.requiredLevel"> · Lv.{{ good.requiredLevel }}</span>
            </p>
            <div class="flex gap-2">
              <input v-model.number="quantities[good.id]" type="number" min="1" :max="Math.min(good.maxCount || 999, good.remaining ?? 999)" class="w-24 border rounded bg-transparent p-2">
              <BaseButton :disabled="disabled || !canBuy(good)" @click="prepare(view === 'market' ? 'exchange' : view === 'cans' ? 'buyCan' : 'buy', { goodsId: good.id, count: quantity(good.id), shopId, slotType: 6 })">
                {{ good.price?.id === 1004 ? '不支持钻石购买' : view === 'market' ? '兑换' : '购买' }}
              </BaseButton>
            </div>
          </article>
        </div>
        <p v-if="!goods.length" class="p-6 text-center text-gray-500">
          暂无可展示商品
        </p>
      </template>

      <template v-else-if="view === 'bag'">
        <BaseButton :disabled="disabled" @click="prepare('sell', { all: true })">
          出售可售产物
        </BaseButton>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="item in store.state.bag" :key="item.uid" class="rounded-lg bg-white p-4 dark:bg-gray-800">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0 flex items-center gap-2">
                <img v-if="item.image" :src="item.image" alt="" class="h-12 w-12 shrink-0 object-contain">
                <strong class="truncate">{{ item.name }} ×{{ item.count }}</strong>
              </div>
              <span v-if="item.locked" class="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">已锁定</span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <input v-model.number="quantities[item.uid]" type="number" min="1" :max="Number(item.count)" class="w-20 border rounded bg-transparent p-2">
              <BaseButton v-if="item.canSell" size="sm" :disabled="disabled" @click="prepare('sell', { uid: item.uid, count: quantity(item.uid) })">
                出售
              </BaseButton>
              <BaseButton v-if="item.lockable" size="sm" variant="secondary" :disabled="disabled" @click="prepare('setItemLock', { uid: item.uid, locked: !item.locked })">
                {{ item.locked ? '解锁' : '上锁' }}
              </BaseButton>
              <BaseButton v-if="item.can && !item.locked" size="sm" :disabled="disabled" @click="prepare('useCan', { uid: item.uid, count: quantity(item.uid) })">
                添加罐头
              </BaseButton>
              <template v-if="item.animalId && !item.locked">
                <select v-model="destinations[item.uid]" class="max-w-full border rounded bg-transparent p-2 text-sm">
                  <option disabled value="">
                    选择窝棚
                  </option>
                  <option v-for="f in store.state.facilities.filter((f: any) => f.ranch)" :key="f.id" :value="f.id">
                    {{ f.name }} {{ f.ranch.count }}/{{ f.ranch.capacity }}
                  </option>
                </select>
                <BaseButton size="sm" :disabled="disabled || !destinations[item.uid]" @click="prepare('place', { ranchId: destinations[item.uid], itemId: item.id, count: quantity(item.uid) })">
                  放养
                </BaseButton>
              </template>
            </div>
          </article>
        </div>
        <p v-if="!store.state.bag?.length" class="p-6 text-center text-gray-500">
          背包为空
        </p>
      </template>

      <template v-else-if="view === 'tasks'">
        <div class="flex flex-wrap gap-2">
          <BaseButton :disabled="disabled || !store.state.tasks?.some((t: any) => t.canClaim)" @click="prepare('claimTasks', { all: true, double: false })">
            领取已完成任务
          </BaseButton>
          <BaseButton :disabled="disabled || !store.state.dailyShare?.canClaim" @click="prepare('claimDailyShare')">
            领取每日分享
          </BaseButton>
          <BaseButton :disabled="disabled || !store.state.dailyBenefit?.available" @click="prepare('claimDailyBenefit')">
            领取每日福利
          </BaseButton>
        </div>
        <article v-for="task in store.state.tasks" :key="task.id" class="rounded-lg bg-white p-4 dark:bg-gray-800">
          <div class="flex justify-between gap-2">
            <strong>{{ task.desc }}</strong>
            <span>{{ task.claimed ? '已领取' : task.canClaim ? '可领取' : !task.unlocked ? '未解锁' : '进行中' }}</span>
          </div>
          <p class="text-sm">
            {{ task.progress }}<span v-if="Number(task.total) > 0">/{{ task.total }}</span>
          </p>
          <progress v-if="Number(task.total) > 0" :value="Number(task.progress)" :max="Number(task.total)" class="w-full" />
          <p class="text-xs">
            {{ task.rewards.map((r: any) => `${r.name} ×${r.count}`).join('、') }}
          </p>
        </article>
      </template>

      <template v-else-if="view === 'illustrated'">
        <div class="flex flex-wrap items-center gap-2">
          <span>普通图鉴 Lv.{{ store.state.book?.normal.level }} · 巨大积分 {{ store.state.book?.giant.score }}</span>
          <BaseButton :disabled="disabled || !store.state.book?.normal.canClaim" @click="prepare('claimIllustrated', { kind: 'normal' })">
            领取普通奖励
          </BaseButton>
          <BaseButton :disabled="disabled || !store.state.book?.giant.levels.some((l: any) => l.canClaim)" @click="prepare('claimIllustrated', { kind: 'giant' })">
            领取巨大奖励
          </BaseButton>
        </div>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <article v-for="animal in store.state.book?.animals" :key="animal.id" class="rounded-lg bg-white p-4 text-center dark:bg-gray-800" :class="!animal.unlocked && 'opacity-50'">
            <img v-if="animal.image" :src="animal.image" alt="" class="mx-auto h-16 w-16 object-contain">
            <strong>{{ animal.name }}</strong>
            <p class="text-sm">
              {{ animal.unlocked ? '已解锁' : '未解锁' }} · {{ animal.progress }}
            </p>
            <p v-if="animal.giant?.unlocked" class="text-xs">
              {{ animal.giant.tierName }} {{ animal.giant.weightKg }} kg
            </p>
          </article>
        </div>
      </template>

      <template v-else-if="view === 'friends'">
        <BaseButton v-if="hostGid" variant="secondary" @click="hostGid = undefined; refresh()">
          返回好友
        </BaseButton>
        <div v-if="!hostGid" class="grid gap-3 lg:grid-cols-3 sm:grid-cols-2">
          <article v-for="friend in store.state.friends" :key="friend.gid" class="flex flex-col justify-between gap-2 rounded-lg bg-white p-4 dark:bg-gray-800" :class="friend.blacklisted && 'opacity-60'">
            <div class="flex items-center justify-between gap-2">
              <strong class="truncate">{{ friend.name }}</strong>
              <span v-if="friend.blacklisted" class="shrink-0 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">黑名单</span>
            </div>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <span v-if="friend.canSteal" class="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">可偷 {{ friend.stealLotCount || '' }}</span>
              <span v-if="friend.canHelp" class="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">可清理 {{ friend.helpCount || '' }}</span>
              <span v-if="friend.canMidwife" class="rounded bg-sky-100 px-2 py-0.5 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">可帮生产 {{ friend.midwifeCount || '' }}</span>
              <span v-if="!friend.canSteal && !friend.canHelp && !friend.canMidwife" class="text-gray-400">暂无可互动项</span>
            </div>
            <div class="flex gap-2">
              <BaseButton size="sm" :disabled="disabled" @click="visit(friend.gid)">
                进入牧场
              </BaseButton>
              <BaseButton size="sm" variant="secondary" :disabled="store.busy" @click="toggleBlacklist(friend.gid)">
                {{ friend.blacklisted ? '移出黑名单' : '加入黑名单' }}
              </BaseButton>
            </div>
          </article>
        </div>
        <div v-else class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="font-semibold">
                {{ store.state.friendRanch?.name }} <span v-if="store.state.friendRanch?.level" class="text-sm text-gray-500 font-normal">Lv.{{ store.state.friendRanch.level }}</span>
              </h2>
              <p v-if="store.state.friendRanch?.career" class="text-xs text-gray-500">
                生涯：收获 {{ store.state.friendRanch.career.totalHarvestCount }} · 成熟 {{ store.state.friendRanch.career.totalMatureCount }} · 偷取 {{ store.state.friendRanch.career.totalStealCount }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <BaseButton :disabled="disabled" @click="prepare('steal', { hostGid })">
                偷取可收产物
              </BaseButton>
              <BaseButton variant="secondary" :disabled="disabled" @click="prepare('cleanFriend', { hostGid })">
                清理好友牧场
              </BaseButton>
            </div>
          </div>
          <div v-if="store.state.friendRanch?.feedMachine" class="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm dark:bg-gray-800">
            <span>好友牧草机 {{ store.state.friendRanch.feedMachine.count }}/{{ store.state.friendRanch.feedMachine.capacity }}（可用牧草 {{ store.state.friendRanch.grassAvailable }}）</span>
            <input v-model.number="quantities[`gift_${hostGid}`]" type="number" min="1" :max="Math.max(1, store.state.friendRanch.feedMachine.capacity - store.state.friendRanch.feedMachine.count)" class="w-24 border rounded bg-transparent p-1.5">
            <BaseButton size="sm" :disabled="disabled || store.state.friendRanch.feedMachine.count >= store.state.friendRanch.feedMachine.capacity" @click="prepare('addGrass', { hostGid, facilityId: store.state.friendRanch.feedMachine.id, count: quantity(`gift_${hostGid}`) })">
              赠送牧草
            </BaseButton>
          </div>
          <article v-for="ranch in store.state.friendRanch?.ranches" :key="ranch.id" class="rounded-lg bg-white p-4 dark:bg-gray-800">
            <div class="flex justify-between">
              <h3>{{ ranch.name }}</h3>
              <BaseButton v-if="ranch.mosquitoRoom > 0" size="sm" variant="secondary" :disabled="disabled" @click="prepare('putMosquito', { hostGid, ranchId: ranch.id })">
                放蚊子
              </BaseButton>
            </div>
            <div v-for="animal in ranch.animals" :key="animal.id" class="flex justify-between py-2">
              <span>{{ animal.name }} · {{ animal.stageName }}</span>
              <BaseButton v-if="animal.canStroke" size="sm" :disabled="disabled" @click="prepare('stroke', { hostGid, ranchId: ranch.id, animalId: animal.id })">
                抚摸
              </BaseButton>
            </div>
          </article>
        </div>
        <p v-if="!hostGid && !store.state.friends?.length" class="p-6 text-center text-gray-500">
          暂无牧场好友
        </p>
      </template>
    </template>
    <ConfirmModal :show="!!pending" :title="pending?.quote.label" :message="confirmation" :loading="store.busy" @confirm="confirm" @cancel="pending = null" @close="pending = null" />
  </section>
</template>
