import { createRouter, createWebHistory } from 'vue-router'
import Landing from '../views/Landing.vue'
import Symptoms from '../views/Symptoms.vue'
import HistoryView from '../views/HistoryView.vue'
import DoctorDashboard from '../views/DoctorDashboard.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import UserProfile from '../views/UserProfile.vue'
import { useAuthStore } from '../stores/auth'

export const routes = [
  { path: '/', name: 'landing', component: Landing },
  { path: '/symptoms', name: 'symptoms', component: Symptoms, meta: { requiresAuth: true } },
  { path: '/history', name: 'history', component: HistoryView, meta: { requiresAuth: true } },
  { path: '/doctor', name: 'doctor', component: DoctorDashboard, meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: UserProfile, meta: { requiresAuth: true } },
  { path: '/profile/edit', redirect: { name: 'profile' } },
  { path: '/login', name: 'login', component: Login },
  { path: '/register', name: 'register', component: Register }
]

export function registerAuthGuard(routerInstance) {
  routerInstance.beforeEach((to) => {
    if (!to.meta?.requiresAuth) return true
    const auth = useAuthStore()
    if (auth.isAuthenticated) return true
    return { path: '/login', query: { next: to.fullPath } }
  })
}

export function createAppRouter(history = createWebHistory()) {
  const r = createRouter({ history, routes })
  registerAuthGuard(r)
  return r
}

export const router = createAppRouter()
