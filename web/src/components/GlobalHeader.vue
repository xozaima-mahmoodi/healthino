<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import LanguageSwitcher from './LanguageSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'
import BackButton from './BackButton.vue'
import HistoryLink from './HistoryLink.vue'
import UserMenu from './UserMenu.vue'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const auth = useAuthStore()

onMounted(() => {
  if (auth.isAuthenticated && !auth.user) auth.fetchMe()
})
</script>

<template>
  <header class="sticky top-0 z-40
                 backdrop-blur-md
                 bg-white/70 dark:bg-slate-900/60
                 border-b border-slate-300/50 dark:border-slate-700/50
                 shadow-sm dark:shadow-none">
    <div class="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
      <RouterLink
        to="/"
        data-testid="brand-link"
        :aria-label="t('app.name')"
        :title="t('app.name')"
        class="inline-flex items-center leading-none shrink-0 rounded-md
               text-slate-700/80 dark:text-slate-200/80
               hover:text-brand-dark dark:hover:text-emerald-300
               transition-colors duration-200
               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      >
        <svg
          data-testid="brand-logo"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 100 32"
          class="h-8 sm:h-9 w-auto"
          role="img"
          :aria-label="t('app.name')"
        >
          <title>{{ t('app.name') }}</title>
          <path
            d="M 8 14 L 50 3 L 92 14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <text
            x="50"
            y="26"
            text-anchor="middle"
            font-family="Vazirmatn, system-ui, sans-serif"
            font-size="14"
            font-weight="700"
            fill="currentColor"
          >{{ t('app.name') }}</text>
        </svg>
      </RouterLink>

      <p class="hidden md:block flex-1 px-4 text-center text-sm md:text-base
                font-medium text-slate-500 dark:text-slate-400 leading-none m-0 truncate">
        {{ t('app.tagline') }}
      </p>

      <div class="flex items-center gap-2 leading-none shrink-0">
        <HistoryLink v-if="auth.isAuthenticated" />
        <UserMenu />
        <BackButton />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>
