<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useLocaleStore } from './stores/locale'
import BackButton from './components/BackButton.vue'

const localeStore = useLocaleStore()

onMounted(() => {
  localeStore.set(localeStore.current)
})
</script>

<template>
  <BackButton />
  <RouterView />
</template>
