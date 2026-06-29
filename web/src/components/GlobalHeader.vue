<script setup>
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import LanguageSwitcher from './LanguageSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'
import BackButton from './BackButton.vue'
import HistoryLink from './HistoryLink.vue'
import UserMenu from './UserMenu.vue'
import { useAuthStore } from '../stores/auth'

const { t, locale } = useI18n()
const auth = useAuthStore()

// Wide tracking only flatters the Latin wordmark ("Healthino"). The Persian and
// Kurdish names ("هلثینو" / "هێلثینۆ") are cursive scripts whose joined glyphs
// break apart under positive letter-spacing, so those stay at natural spacing.
const isLatinWordmark = computed(() => locale.value === 'en')

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
    <div class="max-w-6xl mx-auto px-3 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-3">
      <RouterLink
        to="/"
        data-testid="brand-link"
        :aria-label="t('app.name')"
        :title="t('app.name')"
        class="group inline-flex items-center shrink-0 rounded-xl -mx-1 px-1.5 py-1
               text-slate-700/80 dark:text-slate-200/80
               hover:text-brand-dark dark:hover:text-emerald-300
               transition-colors duration-300 ease-out
               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
      >
        <span
          class="inline-flex items-center gap-2.5 leading-none
                 transition-all duration-300 ease-out
                 group-hover:opacity-80 group-hover:-translate-y-px"
        >
          <!-- Minimalist medical-tech mark: an ultra-thin protective shield
               intertwined with a calm heartbeat/pulse line. -->
          <span
            class="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center
                   rounded-2xl text-brand-dark dark:text-emerald-300
                   bg-gradient-to-br from-brand-soft to-emerald-100
                   dark:from-emerald-500/15 dark:to-emerald-400/[0.04]
                   ring-1 ring-brand/15 dark:ring-emerald-400/20
                   shadow-soft"
          >
            <svg
              data-testid="brand-logo"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              class="h-5 w-5 sm:h-[22px] sm:w-[22px]"
              fill="none"
              role="img"
              :aria-label="t('app.name')"
            >
              <title>{{ t('app.name') }}</title>
              <path
                d="M12 2.75 5 5.6v5.05c0 4.5 3 7.05 7 8.6 4-1.55 7-4.1 7-8.6V5.6L12 2.75Z"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
              <path
                d="M6.75 12.1h2.2l1.25-2.85 1.85 5 1.2-2.15h2.25"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>

          <span
            data-testid="brand-wordmark"
            :class="[
              'text-lg sm:text-xl font-semibold leading-none',
              isLatinWordmark ? 'tracking-[0.04em]' : 'tracking-normal'
            ]"
          >{{ t('app.name') }}</span>
        </span>
      </RouterLink>

      <p class="hidden md:block flex-1 px-4 text-center text-sm md:text-base
                font-medium text-slate-500 dark:text-slate-400 leading-none m-0 truncate">
        {{ t('app.tagline') }}
      </p>

      <div class="flex items-center gap-1 sm:gap-2 leading-none shrink-0">
        <HistoryLink v-if="auth.isAuthenticated" />
        <BackButton />
        <LanguageSwitcher />
        <UserMenu />
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>
