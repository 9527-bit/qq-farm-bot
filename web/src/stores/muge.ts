import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import api from '@/api'
import { useAccountStore } from './account'
import { useToastStore } from './toast'

export interface MugeReward { id: number, name: string, count: number, image: string }
export interface MugeTier { id: string, threshold: number, status: number, rewards: MugeReward[] }
export interface MugeState {
  startTime: number, endTime: number, serverTime: number, active: boolean
  celebration: { total: number, tiers: MugeTier[] } | null
  friends: { count: number, tiers: MugeTier[] } | null
  handbook: { points: number, tiers: MugeTier[], tasks: Array<{ id: string, description: string, status: number, progress: number, target: number, points: number, unlockDay: number, rewards: MugeReward[] }> } | null
  personality: { image: string, personalityId: number, shareRewardClaimed: boolean, answers: Record<string, number> } | null
  questions: Array<{ id: number, title: string, options: Array<{ value: number, text: string, label: string }> }>
}
export type MugeAction = 'claimCelebration' | 'claimFriends' | 'claimTask' | 'claimHandbook' | 'saveAnswers' | 'settle' | 'claimShare'
export const useMugeStore = defineStore('muge', () => {
  const account = useAccountStore()
  const toast = useToastStore()
  const state = ref<MugeState | null>(null)
  const busy = ref(false)
  const error = ref('')
  const needsRefresh = ref(false)
  const serverOffset = ref(0)
  let sequence = 0
  watch(() => account.currentAccountId, () => {
    sequence++
    state.value = null
    busy.value = false
    error.value = ''
    needsRefresh.value = false
  }, { flush: 'sync' })
  async function request(action?: MugeAction, input: Record<string, unknown> = {}) {
    const id = String(account.currentAccountId || '')
    if (!id || busy.value || (action && (needsRefresh.value || !state.value?.active || Date.now() + serverOffset.value >= state.value.endTime))) return false
    const version = ++sequence
    busy.value = true
    error.value = ''
    try {
      const url = `/api/activities/muge${action ? `/${action}` : ''}`
      const options = { headers: { 'x-account-id': id }, timeout: 65000, skipErrorToast: true } as any
      const response = action ? await api.post(url, input, options) : await api.get(url, options)
      if (version !== sequence) return false
      if (!response.data?.ok) throw new Error(response.data?.error || '活动请求失败')
      const result = response.data.data
      if (!action || result.activity) serverOffset.value = (action ? result.activity.serverTime : result.serverTime) - Date.now()
      state.value = action ? result.activity || state.value : result
      needsRefresh.value = action ? result.refreshRequired === true : false
      if (action && action !== 'saveAnswers') toast.success((result.rewards || []).map((x: MugeReward) => `${x.name} ×${x.count}`).join('、') || '操作已完成')
      return true
    } catch (cause: any) {
      if (version === sequence) {
        error.value = cause?.response?.data?.error || cause?.message || '读取失败'
        needsRefresh.value = !!action
      }
      return false
    } finally { if (version === sequence) busy.value = false }
  }
  return { state, busy, error, needsRefresh, serverOffset, request }
})
