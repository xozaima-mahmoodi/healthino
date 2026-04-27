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
      } catch (e) {
        this.error = e?.response?.data || { message: e.message }
      } finally {
        this.submitting = false
      }
    },
    reset() {
      this.result = null
      this.error = null
    }
  }
})
