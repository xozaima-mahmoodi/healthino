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
  <RouterView />
  <ToastContainer />
  <IdleWarningModal />
</template>
