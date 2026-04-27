<script setup>
import { useThemeStore } from '../stores/theme'
import { useI18n } from 'vue-i18n'

const theme = useThemeStore()
const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    :aria-label="t('theme.toggle')"
    :title="t('theme.toggle')"
    class="group inline-flex items-center justify-center
           h-10 w-10 rounded-full
           bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
           border border-white/60 dark:border-white/10
           ring-1 ring-slate-900/5 dark:ring-white/5
           text-slate-700 dark:text-amber-200
           transition-all duration-300 ease-bounceish
           hover:bg-white/90 dark:hover:bg-slate-800/80
           hover:scale-110
           focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
    @click="theme.toggle()"
  >
    <svg v-if="theme.current === 'light'"
         class="h-5 w-5 transition-transform duration-300 group-hover:rotate-45"
         viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
    <svg v-else
         class="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12"
         viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
    </svg>
  </button>
</template>
