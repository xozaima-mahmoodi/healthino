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
           h-9 w-9 sm:h-10 sm:w-10 rounded-full
           bg-white/70 dark:bg-slate-800/60 backdrop-blur-md
           border border-white/60 dark:border-white/10
           ring-1 ring-slate-900/5 dark:ring-white/5
           text-slate-700 dark:text-amber-200
           transition-all duration-200 ease-out
           hover:bg-slate-100/80 dark:hover:bg-slate-800/80
           hover:scale-105 active:scale-95
           hover:shadow-[0_0_16px_-2px_rgba(16,185,129,0.35)]
           focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
    @click="theme.toggle()"
  >
    <Transition name="theme-icon" mode="out-in">
      <svg v-if="theme.current === 'light'"
           key="sun"
           class="h-5 w-5 transform transition-transform duration-500 ease-in-out
                  group-hover:scale-110 group-hover:rotate-45 group-active:scale-90"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
      <svg v-else
           key="moon"
           class="h-5 w-5 transform transition-transform duration-500 ease-in-out
                  group-hover:scale-110 group-hover:-rotate-12 group-active:scale-90"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
      </svg>
    </Transition>
  </button>
</template>

<style scoped>
/* Cinematic flip: the outgoing icon spins out and shrinks while the incoming
   one spins in, so switching light/dark feels like a satisfying dial turn. */
.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: transform 400ms ease-in-out, opacity 400ms ease-in-out;
}
.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-90deg) scale(0.4);
}
.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(90deg) scale(0.4);
}
@media (prefers-reduced-motion: reduce) {
  .theme-icon-enter-active,
  .theme-icon-leave-active {
    transition: opacity 200ms ease;
  }
  .theme-icon-enter-from,
  .theme-icon-leave-to {
    transform: none;
  }
}
</style>
