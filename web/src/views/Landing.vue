<script setup>
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import GlobalHeader from '../components/GlobalHeader.vue'

const { t } = useI18n()
</script>

<template>
  <main class="relative min-h-screen overflow-x-hidden mesh-bg flex flex-col">
    <!-- Decorative blobs -->
    <div class="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
      <div class="absolute -top-32 -left-24 h-80 w-80 rounded-full
                  bg-emerald-300/30 dark:bg-emerald-500/10 blur-3xl"></div>
      <div class="absolute top-1/2 -right-32 h-[420px] w-[420px] rounded-full
                  bg-sky-300/25 dark:bg-sky-500/10 blur-3xl"></div>
      <div class="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full
                  bg-indigo-300/20 dark:bg-indigo-500/10 blur-3xl"></div>
      <div class="absolute inset-0 dot-grid opacity-60"></div>
    </div>

    <GlobalHeader />

    <section class="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 py-10 sm:py-14">
      <div
        class="w-full max-w-6xl mx-auto rounded-3xl
               bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
               border border-white/60 dark:border-white/10
               ring-1 ring-slate-900/5 dark:ring-emerald-400/15
               shadow-glass dark:shadow-glass-dk
               px-6 py-10 sm:px-10 sm:py-14 text-center"
      >
        <div class="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center
                    rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700
                    text-white shadow-lg shadow-brand/30 dark:shadow-emerald-900/50">
          <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12h4l2-6 4 12 2-6h6"/>
          </svg>
        </div>

        <h1 class="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100
                   leading-relaxed sm:whitespace-nowrap">
          {{ t('landing.hero_title') }}
        </h1>

        <RouterLink
          to="/symptoms"
          class="group mt-10 sm:mt-12 inline-flex items-center justify-center gap-3
                 px-10 sm:px-12 py-4 sm:py-5 rounded-full
                 bg-brand text-white text-base sm:text-lg font-semibold
                 shadow-cta
                 transition-all duration-300 ease-bounceish
                 hover:bg-brand-dark hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-8px_rgba(5,150,105,0.55)]
                 active:translate-y-0 active:shadow-cta
                 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
        >
          <span>{{ t('landing.cta_start') }}</span>
          <svg
            class="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1
                   rtl:rotate-180 rtl:group-hover:-translate-x-1"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </RouterLink>

        <p class="mt-8 sm:mt-10 text-sm text-slate-500 dark:text-slate-400
                  leading-relaxed mx-auto lg:whitespace-nowrap">
          {{ t('landing.hero_sub') }}
        </p>
      </div>
    </section>

    <footer class="relative z-10 px-4 pb-6 text-center text-xs text-slate-400 dark:text-slate-500">
      © {{ new Date().getFullYear() }} {{ t('app.name') }}
    </footer>
  </main>
</template>
