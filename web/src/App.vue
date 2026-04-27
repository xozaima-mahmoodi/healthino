<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useLocaleStore } from './stores/locale'

const localeStore = useLocaleStore()

onMounted(() => {
  localeStore.set(localeStore.current)
})
</script>

<template>
  <RouterView />
</template>
