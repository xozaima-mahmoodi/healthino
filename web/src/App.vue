<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import { useLocaleStore } from './stores/locale'
import { useThemeStore } from './stores/theme'
import { useHealthStore } from './stores/health'
import { useToastStore } from './stores/toast'
import { useGlobalErrorBoundary } from './composables/useGlobalErrorBoundary'
import { logResolvedBaseUrl } from './api/client'
import ToastContainer from './components/ToastContainer.vue'
import IdleWarningModal from './components/IdleWarningModal.vue'

const { t } = useI18n()
const localeStore = useLocaleStore()
const themeStore = useThemeStore()
const healthStore = useHealthStore()
const toast = useToastStore()

useGlobalErrorBoundary({ message: t('toast.unexpected_error') })

onMounted(async () => {
  logResolvedBaseUrl()
  localeStore.set(localeStore.current)
  themeStore.init()
  const online = await healthStore.ping({ retries: 4 })
  if (!online) toast.error(t('toast.server_unreachable'))
})
</script>

<template>
  <!--
    Ambient premium background. A single fixed layer painted once at the app
    root: it spans the viewport, never scrolls (bg-fixed behaviour), and clips
    its own glows with overflow-hidden so the oversized blobs can bleed past the
    edges without ever creating a scrollbar or shifting layout. Sitting at -z-10
    keeps it strictly behind every routed view, which all render transparently.
  -->
  <div
    aria-hidden="true"
    class="fixed inset-0 -z-10 w-full min-h-screen overflow-hidden
           bg-[#f8fafc] dark:bg-slate-950
           transition-colors duration-500 ease-out"
  >
    <!-- Soft brand-emerald glow drifting in from the top-right -->
    <div
      class="absolute -top-40 -right-32 h-[34rem] w-[34rem] rounded-full
             bg-emerald-200/30 dark:bg-emerald-500/10 blur-[120px]
             will-change-transform animate-aura-drift"
    ></div>
    <!-- Gentle teal glow anchored in the bottom-left -->
    <div
      class="absolute -bottom-48 -left-40 h-[36rem] w-[36rem] rounded-full
             bg-teal-200/20 dark:bg-teal-500/10 blur-[120px]
             will-change-transform animate-aura-drift-alt"
    ></div>
    <!-- Faint indigo accent floating through the centre for depth -->
    <div
      class="absolute top-1/3 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full
             bg-indigo-200/15 dark:bg-indigo-500/[0.07] blur-[120px]
             will-change-transform animate-aura-breathe"
    ></div>

    <!--
      Luxury ECG pulse-wave watermark. Painted above the moving glows so the
      soft emerald/teal light passes behind the medical waves for a premium
      sense of depth. The pattern carries its own composited mask (see
      .ecg-pattern in style.css): crisp along the top + side edges, melting
      away through the centre and bottom so the content card stays readable.
    -->
    <div class="absolute inset-0 ecg-pattern"></div>
  </div>

  <RouterView />
  <ToastContainer />
  <IdleWarningModal />
</template>
