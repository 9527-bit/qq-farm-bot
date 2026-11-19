import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import api from '@/api'
import { useAccountStore } from './account'

export interface RanchItem { id: number, name: string, count: string, image: string }
export interface RanchQuote { label: string, costItems: RanchItem[], rewards: RanchItem[], expected: { signature: string }, skipped: boolean, message?: string }
export const useRanchStore = defineStore('ranch', () => {
  const account = useAccountStore()
  const state = ref<any>(null)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const uncertain = ref(false)
  let generation = 0
  let query: Record<string, unknown> = { view: 'animals' }
  watch(() => account.currentAccountId, () => {
    generation++
    state.value = null
    loading.value = busy.value = uncertain.value = false
    error.value = notice.value = ''
  }, { flush: 'sync' })
  async function call(path: string, body?: unknown) {
    const id = account.currentAccountId
    const options = { timeout: 65000, headers: { 'x-account-id': id }, skipErrorToast: true } as any
    const response = body === undefined ? await api.get(path, { ...options, params: query }) : await api.post(path, body, options)
    if (!response.data?.ok) throw new Error(response.data?.error || '牧场请求失败')
    return response.data.data
  }
  async function load(params = query) {
    if (!account.currentAccountId || loading.value || busy.value) return
    query = params
    const version = ++generation
    loading.value = true
    error.value = ''
    try {
      const result = await call('/api/ranch')
      if (version === generation) { state.value = result; uncertain.value = false }
    } catch (cause: any) {
      if (version === generation) error.value = cause.response?.data?.error || cause.message
    } finally { if (version === generation) loading.value = false }
  }
  async function quote(action: string, input: Record<string, unknown>): Promise<RanchQuote | null> {
    if (loading.value || busy.value || uncertain.value || !account.currentAccountId) return null
    const version = generation
    busy.value = true
    error.value = notice.value = ''
    try {
      const result = await call(`/api/ranch/${action}/quote`, input)
      return version === generation ? result : null
    } catch (cause: any) {
      if (version === generation) error.value = cause.response?.data?.error || cause.message
      return null
    } finally { if (version === generation) busy.value = false }
  }
  async function execute(action: string, input: Record<string, unknown>) {
    if (busy.value || loading.value || uncertain.value || !account.currentAccountId) return false
    const version = generation
    busy.value = true
    error.value = notice.value = ''
    let ok = false
    try {
      const result = await call(`/api/ranch/${action}`, input)
      if (version === generation) {
        notice.value = result.notice || (result.status === 'skipped' ? '当前没有可操作项目' : '操作已完成')
        ok = true
      }
    } catch (cause: any) {
      if (version === generation) {
        error.value = `${cause.response?.data?.error || cause.message}；请刷新核对结果`
        uncertain.value = true
      }
    } finally { if (version === generation) busy.value = false }
    if (ok && version === generation) await load()
    return ok
  }
  return { state, loading, busy, error, notice, uncertain, load, quote, execute }
})
