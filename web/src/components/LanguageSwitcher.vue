<script setup>
import { computed } from 'vue'
import { useLocaleStore } from '../stores/locale'

const locale = useLocaleStore()
const options = [
  { code: 'fa',  label: 'فارسی' },
  { code: 'ckb', label: 'کوردی' },
  { code: 'en',  label: 'EN' }
]

// Position of the sliding pill (0-based index of the active language).
const activeIndex = computed(() => {
  const i = options.findIndex(o => o.code === locale.current)
  return i === -1 ? 0 : i
})
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Language"
    data-testid="language-switcher"
    class="inline-flex items-center gap-1 rounded-full
           bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
           border border-white/60 dark:border-white/10
           ring-1 ring-slate-900/5 dark:ring-white/5
           shadow-sm dark:shadow-none p-0.5 sm:p-1"
  >
    <span class="hidden sm:inline-flex ps-2 pe-1 text-slate-400 dark:text-slate-500" aria-hidden="true">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
      </svg>
    </span>

    <!-- Sliding track: the emerald pill glides behind the active language -->
    <div class="relative grid grid-cols-3">
      <span
        aria-hidden="true"
        class="absolute inset-y-0 z-0 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30
               transition-all duration-300 ease-out motion-reduce:transition-none"
        :style="{ insetInlineStart: `calc(${activeIndex} * 100% / 3)`, width: 'calc(100% / 3)' }"
      ></span>

      <button
        v-for="opt in options"
        :key="opt.code"
        type="button"
        role="radio"
        :aria-checked="locale.current === opt.code"
        :class="[
          'relative z-10 px-2 py-1 sm:px-3 sm:py-1.5 text-center text-xs sm:text-sm font-medium',
          'rounded-full transition-colors duration-300 ease-out focus:outline-none',
          locale.current === opt.code
            ? 'text-white'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
        ]"
        @click="locale.set(opt.code)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>
