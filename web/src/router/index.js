import { createRouter, createWebHistory } from 'vue-router'
import Landing from '../views/Landing.vue'
import Symptoms from '../views/Symptoms.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: Landing },
    { path: '/symptoms', name: 'symptoms', component: Symptoms }
  ]
})
