<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const visible = computed(() => route.path !== '/')

function goBack() {
  router.back()
}
</script>

<template>
  <button
    v-if="visible"
    type="button"
    :aria-label="t('nav.back')"
    :title="t('nav.back')"
    class="group fixed top-4 sm:top-6 start-4 sm:start-6 z-30
           inline-flex items-center justify-center
           h-11 w-11 rounded-full
           bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
           border border-white/60 dark:border-white/10
           ring-1 ring-slate-900/5 dark:ring-white/5
           shadow-sm dark:shadow-none text-slate-700 dark:text-slate-200
           transition-all duration-200 ease-bounceish
           hover:bg-white/85 dark:hover:bg-slate-800/80 hover:backdrop-blur-xl
           hover:scale-110 hover:shadow-md hover:text-brand-dark dark:hover:text-emerald-300
           active:scale-100
           focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
    @click="goBack"
  >
    <svg class="h-5 w-5 rtl:rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5"
         viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  </button>
</template>
