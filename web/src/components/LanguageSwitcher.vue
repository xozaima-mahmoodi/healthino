<script setup>
import { useLocaleStore } from '../stores/locale'

const locale = useLocaleStore()
const options = [
  { code: 'fa',  label: 'فارسی' },
  { code: 'ckb', label: 'کوردی' }
]
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Language"
    class="inline-flex items-center gap-1 rounded-full
           bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
           border border-white/60 dark:border-white/10
           ring-1 ring-slate-900/5 dark:ring-white/5
           shadow-sm dark:shadow-none p-1"
  >
    <span class="ps-2 pe-1 text-slate-400 dark:text-slate-500" aria-hidden="true">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
      </svg>
    </span>
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      role="radio"
      :aria-checked="locale.current === opt.code"
      :class="[
        'px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ease-bounceish',
        locale.current === opt.code
          ? 'bg-brand text-white shadow-sm shadow-brand/30'
          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/5'
      ]"
      @click="locale.set(opt.code)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
