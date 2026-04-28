<script setup>
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './LanguageSwitcher.vue'
import ThemeToggle from './ThemeToggle.vue'
import BackButton from './BackButton.vue'
import HomeButton from './HomeButton.vue'

const { t } = useI18n()
</script>

<template>
  <header class="sticky top-0 z-40
                 backdrop-blur-md
                 bg-white/70 dark:bg-slate-900/60
                 border-b border-slate-300/50 dark:border-slate-700/50
                 shadow-sm dark:shadow-none">
    <div class="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
      <div data-testid="brand"
           class="flex items-center gap-2 leading-none shrink-0">
        <span class="text-sm sm:text-base font-bold text-slate-700/80 dark:text-slate-200/80">
          {{ t('app.name') }}
        </span>
        <HomeButton />
      </div>

      <p class="hidden md:block flex-1 px-4 text-center text-sm md:text-base
                font-medium text-slate-500 dark:text-slate-400 leading-none m-0 truncate">
        {{ t('app.tagline') }}
      </p>

      <div class="flex items-center gap-2 leading-none shrink-0">
        <BackButton />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>
