import axios from 'axios'
import { useAuthStore } from '../stores/auth'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000
})

api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})
