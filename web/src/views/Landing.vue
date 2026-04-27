<script setup>
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'

const { t } = useI18n()
</script>

<template>
  <main class="relative min-h-screen overflow-hidden mesh-bg flex flex-col">
    <!-- Decorative blobs -->
    <div class="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
      <div class="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl"></div>
      <div class="absolute top-1/2 -right-32 h-[420px] w-[420px] rounded-full bg-sky-300/25 blur-3xl"></div>
      <div class="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl"></div>
      <div class="absolute inset-0 dot-grid opacity-60"></div>
    </div>

    <!-- Top-left language switcher (absolute, RTL-independent) -->
    <div class="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
      <LanguageSwitcher />
    </div>

    <!-- Top-right brand mark (physical position) -->
    <div class="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
      <span class="text-sm sm:text-base font-bold text-slate-700/80 tracking-wide">
        {{ t('app.name') }}
      </span>
    </div>

    <!-- Centered glass card -->
    <section class="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 py-24 sm:py-28">
      <div
        class="w-full max-w-2xl rounded-3xl
               bg-white/80 backdrop-blur-xl
               border border-white/60 ring-1 ring-slate-900/5
               shadow-glass
               px-6 py-10 sm:px-12 sm:py-14 text-center"
      >
        <!-- Medical mark -->
        <div class="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center
                    rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700
                    text-white shadow-lg shadow-brand/30">
          <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12h4l2-6 4 12 2-6h6"/>
          </svg>
        </div>

        <p class="text-sm sm:text-base font-semibold text-brand-dark/80 mb-4 mx-auto max-w-md">
          {{ t('app.tagline') }}
        </p>

        <h1 class="text-2xl sm:text-4xl font-bold text-slate-800 leading-relaxed mx-auto max-w-xl">
          {{ t('landing.hero_title') }}
        </h1>

        <p class="mt-5 text-base sm:text-lg font-medium text-slate-600 leading-relaxed mx-auto max-w-xl">
          {{ t('landing.hero_sub') }}
        </p>

        <RouterLink
          to="/symptoms"
          class="group mt-9 inline-flex items-center justify-center gap-2
                 px-7 py-3.5 rounded-full
                 bg-brand text-white font-semibold
                 shadow-cta
                 transition-all duration-300 ease-bounceish
                 hover:bg-brand-dark hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-8px_rgba(5,150,105,0.55)]
                 active:translate-y-0 active:shadow-cta
                 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring"
        >
          <span>{{ t('landing.cta_start') }}</span>
          <svg
            class="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1
                   rtl:rotate-180 rtl:group-hover:-translate-x-1"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </RouterLink>

        <!-- Trust line -->
        <div class="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <span dir="auto">HIPAA · GDPR</span>
        </div>
      </div>
    </section>

    <footer class="relative z-10 px-4 pb-6 text-center text-xs text-slate-400">
      © {{ new Date().getFullYear() }} {{ t('app.name') }}
    </footer>
  </main>
</template>
