<script setup>
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

function logout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <div v-if="!auth.isAuthenticated" data-testid="login-link-wrap" class="flex items-center">
    <RouterLink
      to="/login"
      data-testid="login-link"
      :aria-label="t('auth.sign_in')"
      :title="t('auth.sign_in')"
      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
             bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
             border border-white/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-white/5
             text-slate-700 dark:text-slate-200
             hover:bg-brand-soft dark:hover:bg-emerald-900/30
             hover:text-brand-dark dark:hover:text-emerald-200
             transition"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
        <path d="M10 17l5-5-5-5"/>
        <path d="M15 12H3"/>
      </svg>
      {{ t('auth.sign_in') }}
    </RouterLink>
  </div>

  <div v-else data-testid="user-menu" class="flex items-center gap-2">
    <span
      data-testid="user-display-name"
      class="hidden sm:inline text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[10rem]"
      :title="auth.displayName"
    >
      {{ auth.displayName }}
    </span>
    <button
      type="button"
      data-testid="logout-button"
      :aria-label="t('auth.logout')"
      :title="t('auth.logout')"
      @click="logout"
      class="inline-flex items-center justify-center h-9 w-9 rounded-full
             bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
             border border-white/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-white/5
             text-slate-600 dark:text-slate-300
             hover:bg-red-50 hover:text-red-600
             dark:hover:bg-red-900/30 dark:hover:text-red-300
             transition"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <path d="M16 17l5-5-5-5"/>
        <path d="M21 12H9"/>
      </svg>
    </button>
  </div>
</template>
