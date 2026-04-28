import { defineStore } from 'pinia'
import { api } from '../api/client'

export const useHistoryStore = defineStore('history', {
  state: () => ({
    loading: false,
    error: null,
    patient: null,
    viewingAs: null,
    items: []
  }),
  actions: {
    async fetch({ userId } = {}) {
      this.loading = true
      this.error = null
      try {
        const params = userId ? { user_id: userId } : {}
        const { data } = await api.get('/api/v1/assessments', { params })
        this.patient = data.patient || null
        this.viewingAs = data.viewing_as || null
        this.items = Array.isArray(data.assessments) ? data.assessments : []
      } catch (e) {
        const status = e?.response?.status
        this.error = {
          status,
          message: e?.response?.data?.error || e.message
        }
        this.items = []
      } finally {
        this.loading = false
      }
    },
    clear() {
      this.patient = null
      this.viewingAs = null
      this.items = []
      this.error = null
    }
  }
})
