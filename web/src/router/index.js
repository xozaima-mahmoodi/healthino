import { createRouter, createWebHistory } from 'vue-router'
import Landing from '../views/Landing.vue'
import Symptoms from '../views/Symptoms.vue'
import HistoryView from '../views/HistoryView.vue'
import DoctorDashboard from '../views/DoctorDashboard.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: Landing },
    { path: '/symptoms', name: 'symptoms', component: Symptoms },
    { path: '/history', name: 'history', component: HistoryView },
    { path: '/doctor', name: 'doctor', component: DoctorDashboard }
  ]
})
