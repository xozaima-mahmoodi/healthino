<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useLocaleStore } from './stores/locale'
import { useThemeStore } from './stores/theme'
import ToastContainer from './components/ToastContainer.vue'

const localeStore = useLocaleStore()
const themeStore = useThemeStore()

onMounted(() => {
  localeStore.set(localeStore.current)
  themeStore.init()
})
</script>

<template>
  <RouterView />
  <ToastContainer />
</template>
