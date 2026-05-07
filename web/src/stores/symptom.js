import { defineStore } from 'pinia'
import { api } from '../api/client'

export const useSymptomStore = defineStore('symptom', {
  state: () => ({
    submitting: false,
    result: null,
    error: null
  }),
  actions: {
    async analyze(payload) {
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.post('/api/v1/symptom_checker', payload)
        this.result = data
        return true
      } catch (e) {
        const status = e?.response?.status
        const body = e?.response?.data
        console.warn('[symptom] analyze failed', { status, message: e?.message })
        this.error = body || { message: e?.message || 'request_failed' }
        return false
      } finally {
        this.submitting = false
      }
    },
    reset() {
      this.result = null
      this.error = null
      this.submitting = false
    }
  }
})
