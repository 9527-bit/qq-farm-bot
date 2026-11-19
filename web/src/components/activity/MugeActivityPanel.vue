<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useMugeStore } from '@/stores/muge'
import type { MugeAction } from '@/stores/muge'
import { useAccountStore } from '@/stores/account'

defineEmits<{ back: [] }>()
const store = useMugeStore()
const account = useAccountStore()
const tab = ref('celebration')
const now = ref(Date.now())
let mounted = false
let timer: ReturnType<typeof setTimeout> | undefined
const tabs = [{ id: 'celebration', name: '兴牧庆典' }, { id: 'friends', name: '牧友同行' }, { id: 'handbook', name: '成长手册' }, { id: 'personality', name: '牧场人格' }]
const active = computed(() => !!store.state?.active && now.value + store.serverOffset < store.state.endTime)
const disabled = computed(() => store.busy || store.needsRefresh || !active.value)
const tierSection = computed(() => tab.value === 'celebration' ? store.state?.celebration : tab.value === 'friends' ? store.state?.friends : store.state?.handbook)
const tiers = computed(() => tierSection.value?.tiers || [])
const claimAction = computed<MugeAction>(() => tab.value === 'celebration' ? 'claimCelebration' : tab.value === 'friends' ? 'claimFriends' : 'claimHandbook')
const status = (value: number) => value === 3 ? '已领取' : value === 2 ? '可领取' : value === 4 ? '未解锁' : '进行中'
const date = (value: number) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
async function refresh() {
  now.value = Date.now()
  if (!store.state || active.value) await store.request()
  schedule()
}
function schedule() {
  clearTimeout(timer)
  if (mounted && document.visibilityState === 'visible' && active.value) timer = setTimeout(refresh, Math.max(50, Math.min(30000, (store.state?.endTime || Infinity) - (Date.now() + store.serverOffset))))
}
function visibility() { clearTimeout(timer); if (document.visibilityState === 'visible' && (!store.state || active.value)) void refresh() }
watch(() => account.currentAccountId, () => { tab.value = 'celebration'; void refresh() })
onMounted(() => { mounted = true; document.addEventListener('visibilitychange', visibility); void refresh() })
onUnmounted(() => { mounted = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) })
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-center gap-3">
      <BaseButton variant="ghost" @click="$emit('back')">← 返回活动</BaseButton>
      <img src="/activity/muge/icon.png" alt="" class="h-10 w-10 object-contain">
      <div class="min-w-0 flex-1"><h1 class="text-xl font-semibold">牧歌初启</h1><p v-if="store.state" class="text-xs text-gray-500">{{ date(store.state.startTime) }} — {{ date(store.state.endTime) }}</p></div>
      <BaseButton :disabled="!account.currentAccountId || store.busy" :loading="store.busy" @click="refresh">刷新</BaseButton>
    </header>
    <p v-if="!account.currentAccountId" class="rounded-lg bg-white p-8 text-center dark:bg-gray-800">请选择账号</p>
    <p v-else-if="store.error" role="alert" class="rounded-lg bg-amber-50 p-3 text-amber-800">{{ store.error }}</p>
    <p v-if="store.busy && !store.state" class="p-8 text-center">正在读取活动…</p>
    <p v-else-if="!store.state && !store.error && account.currentAccountId" class="p-8 text-center">暂无活动数据</p>
    <template v-if="store.state">
      <p v-if="!active" class="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">{{ now < store.state.startTime ? '活动尚未开始' : '活动已结束' }}</p>
      <nav class="flex gap-2 overflow-x-auto"><BaseButton v-for="item in tabs" :key="item.id" :variant="tab === item.id ? 'primary' : 'secondary'" @click="tab = item.id">{{ item.name }}</BaseButton></nav>
      <template v-if="tab !== 'personality'">
        <div class="flex items-center justify-between gap-2 rounded-lg bg-white p-4 dark:bg-gray-800">
          <strong>{{ tab === 'celebration' ? `全服累计饲养 ${store.state.celebration?.total ?? '—'}` : tab === 'friends' ? `已开启牧场好友 ${store.state.friends?.count ?? '—'}` : `手册积分 ${store.state.handbook?.points ?? '—'}` }}</strong>
          <BaseButton :disabled="disabled || !tiers.some(t => t.status === 2)" @click="store.request(claimAction)">领取档位奖励</BaseButton>
        </div>
        <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="(tier, index) in tiers" :key="tier.id" class="border rounded-lg bg-white p-4 dark:border-gray-700 dark:bg-gray-800" :class="tier.status === 2 && 'border-green-500'">
            <div class="flex justify-between"><strong>{{ index + 1 }} · {{ tier.threshold.toLocaleString() }}</strong><span class="text-sm">{{ status(tier.status) }}</span></div>
            <div class="mt-3 flex flex-wrap gap-3"><span v-for="reward in tier.rewards" :key="reward.id" class="inline-flex items-center gap-1 text-sm"><img v-if="reward.image" :src="reward.image" alt="" class="h-8 w-8 object-contain">{{ reward.name }} ×{{ reward.count }}</span></div>
          </li>
        </ol>
        <section v-if="tab === 'handbook'" class="space-y-3">
          <BaseButton :disabled="disabled || !store.state.handbook?.tasks.some(t => t.status === 2)" @click="store.request('claimTask')">领取任务奖励</BaseButton>
          <article v-for="task in store.state.handbook?.tasks" :key="task.id" class="rounded-lg bg-white p-4 dark:bg-gray-800">
            <div class="flex justify-between gap-2"><span>{{ task.description }}</span><span class="shrink-0 text-sm">{{ status(task.status) }}</span></div>
            <p class="mt-2 text-sm">第 {{ task.unlockDay }} 天 · {{ task.target > 0 ? `${task.progress}/${task.target}` : task.progress }} · {{ task.points }} 积分</p>
            <progress v-if="task.target > 0" :value="task.progress" :max="task.target" class="mt-2 w-full" />
            <p class="text-xs text-gray-500">{{ task.rewards.map(r => `${r.name} ×${r.count}`).join('、') }}</p>
          </article>
        </section>
      </template>
      <section v-else class="space-y-4">
        <img v-if="store.state.personality?.image" :src="store.state.personality.image" alt="牧场人格" class="mx-auto max-h-96 max-w-full rounded-lg">
        <fieldset v-for="question in store.state.questions" :key="question.id" :disabled="disabled" class="rounded-lg bg-white p-4 dark:bg-gray-800">
          <legend class="pt-3 font-medium">{{ question.id }}. {{ question.title }}</legend>
          <div class="mt-2 grid gap-2 sm:grid-cols-2"><button v-for="option in question.options" :key="option.value" class="rounded border p-3 text-left text-sm disabled:opacity-50" :class="store.state.personality?.answers[question.id] === option.value ? 'border-green-500 bg-green-50 text-green-900' : 'border-gray-200 dark:border-gray-700'" @click="store.request('saveAnswers', { answers: { [question.id]: option.value } })">{{ option.label }}. {{ option.text }}</button></div>
        </fieldset>
        <div class="flex flex-wrap gap-2"><BaseButton :disabled="disabled || !store.state.questions.every(q => store.state?.personality?.answers[q.id])" @click="store.request('settle')">生成人格</BaseButton><BaseButton :disabled="disabled || !store.state.personality?.personalityId || store.state.personality.shareRewardClaimed" @click="store.request('claimShare')">领取分享奖励</BaseButton><BaseButton variant="secondary" :disabled="disabled" @click="store.request('saveAnswers', { answers: {}, clear: true })">重新答题</BaseButton></div>
      </section>
    </template>
  </section>
</template>
