<script setup>
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'

const { t } = useI18n()
</script>

<template>
  <main class="min-h-screen flex flex-col">
    <header class="px-4 py-4 sm:px-8 flex items-center justify-between">
      <div class="text-xl sm:text-2xl font-bold text-brand-dark">{{ t('app.name') }}</div>
      <LanguageSwitcher />
    </header>

    <section class="flex-1 flex items-center justify-center px-4">
      <div class="max-w-2xl text-center">
        <h1 class="text-3xl sm:text-5xl font-bold text-slate-900 leading-tight">
          {{ t('landing.hero_title') }}
        </h1>
        <p class="mt-4 text-base sm:text-lg text-slate-600">
          {{ t('landing.hero_sub') }}
        </p>
        <RouterLink
          to="/symptoms"
          class="mt-8 inline-block px-6 py-3 rounded-full bg-brand text-white font-semibold shadow-md hover:bg-brand-dark transition"
        >
          {{ t('landing.cta_start') }}
        </RouterLink>
      </div>
    </section>

    <footer class="px-4 py-4 text-center text-xs text-slate-400">
      {{ t('app.tagline') }}
    </footer>
  </main>
</template>
