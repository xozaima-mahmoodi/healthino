<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, RouterLink } from 'vue-router'

const route = useRoute()
const { t } = useI18n()

const visible = computed(() => route.path !== '/')
</script>

<template>
  <RouterLink
    v-if="visible"
    to="/"
    data-testid="home-link"
    :aria-label="t('nav.home')"
    :title="t('nav.home')"
    class="inline-flex items-center justify-center leading-none rounded-md
           text-slate-700/80 dark:text-slate-200/80
           hover:text-brand-dark dark:hover:text-emerald-300
           transition-colors duration-200
           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m3 11 9-8 9 8"/>
      <path d="M5 10v10a1 1 0 0 0 1 1h3v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6h3a1 1 0 0 0 1-1V10"/>
    </svg>
  </RouterLink>
</template>
