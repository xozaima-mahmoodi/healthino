<script setup>
import { ref, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const open = ref(false)
const rootEl = ref(null)

function toggle() { open.value = !open.value }
function close() { open.value = false }

function onDocumentClick(e) {
  if (!rootEl.value) return
  if (!rootEl.value.contains(e.target)) close()
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

watch(open, (v) => {
  if (v) {
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

function logout() {
  close()
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

  <div
    v-else
    ref="rootEl"
    data-testid="user-menu"
    class="relative"
  >
    <button
      type="button"
      data-testid="user-menu-trigger"
      :aria-label="t('auth.account_menu')"
      :title="auth.displayName || t('auth.account_menu')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
      class="inline-flex items-center justify-center h-9 w-9 rounded-full
             bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
             border border-white/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-white/5
             text-slate-700 dark:text-slate-200
             hover:bg-white/90 dark:hover:bg-slate-800/80
             hover:text-brand-dark dark:hover:text-emerald-300
             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring
             transition"
    >
      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </button>

    <div
      v-show="open"
      data-testid="user-menu-panel"
      role="menu"
      :aria-hidden="!open"
      class="absolute end-0 mt-2 w-56 origin-top-end rounded-xl py-2
             bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl
             border border-white/60 dark:border-white/10
             ring-1 ring-slate-900/10 dark:ring-emerald-400/15
             shadow-lg z-50"
    >
      <div class="px-4 py-2 border-b border-slate-200/70 dark:border-white/10">
        <p class="text-xs text-slate-500 dark:text-slate-400 leading-none mb-1">
          {{ t('auth.account_menu') }}
        </p>
        <p
          data-testid="user-display-name"
          class="text-sm font-medium text-slate-800 dark:text-slate-100 truncate"
          :title="auth.displayName"
        >
          {{ auth.displayName }}
        </p>
      </div>

      <RouterLink
        to="/profile"
        role="menuitem"
        data-testid="user-menu-profile"
        @click="close"
        class="flex items-center gap-2 px-4 py-2 text-sm
               text-slate-700 dark:text-slate-200
               hover:bg-slate-100 dark:hover:bg-slate-700/60
               focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-700/60"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        {{ t('auth.profile_my') }}
      </RouterLink>

      <div class="my-1 h-px bg-slate-200/70 dark:bg-white/10" aria-hidden="true"></div>

      <button
        type="button"
        role="menuitem"
        data-testid="logout-button"
        :aria-label="t('auth.logout')"
        @click="logout"
        class="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium
               text-red-600 dark:text-red-300
               hover:bg-red-50 dark:hover:bg-red-900/30
               focus:outline-none focus:bg-red-50 dark:focus:bg-red-900/30
               transition"
      >
        <svg class="h-4 w-4 text-red-600 dark:text-red-300" viewBox="0 0 24 24"
             fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <path d="M16 17l5-5-5-5"/>
          <path d="M21 12H9"/>
        </svg>
        {{ t('auth.logout') }}
      </button>
    </div>
  </div>
</template>
