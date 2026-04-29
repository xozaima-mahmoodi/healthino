<script setup>
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
</script>

<template>
  <RouterLink
    to="/history"
    data-testid="history-link"
    :aria-label="t('nav.history')"
    :title="t('nav.history')"
    class="group inline-flex items-center justify-center
           h-9 w-9 sm:h-10 sm:w-10 rounded-full
           bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
           border border-white/60 dark:border-white/10
           ring-1 ring-slate-900/5 dark:ring-white/5
           shadow-sm dark:shadow-none text-slate-700 dark:text-slate-200
           transition-all duration-200 ease-bounceish
           hover:bg-white/90 dark:hover:bg-slate-800/80
           hover:scale-110 hover:shadow-md
           hover:text-brand-dark dark:hover:text-emerald-300
           active:scale-100
           focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7"/>
      <path d="M3 4v5h5"/>
      <path d="M12 7v5l3 2"/>
    </svg>
  </RouterLink>
</template>
