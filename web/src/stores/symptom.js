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
      console.log('[symptom-debug] analyze() start', payload)
      this.submitting = true
      this.error = null
      try {
        const { data } = await api.post('/api/v1/symptom_checker', payload)
        console.log('[symptom-debug] analyze() response', data)
        this.result = data
      } catch (e) {
        const status = e?.response?.status
        const body = e?.response?.data
        console.warn('[symptom-debug] analyze() failed', { status, body, message: e?.message })
        this.error = body || { message: e?.message || 'request_failed' }
      } finally {
        console.log('[symptom-debug] analyze() finally — clearing submitting')
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
