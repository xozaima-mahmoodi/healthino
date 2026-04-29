<script setup>
import { useToastStore } from '../stores/toast'
import ToastNotification from './ToastNotification.vue'

const toastStore = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div
      data-testid="toast-container"
      aria-live="polite"
      aria-atomic="false"
      class="pointer-events-none fixed top-4 end-4 z-[100] flex flex-col gap-2 items-end"
    >
      <TransitionGroup name="toast">
        <ToastNotification
          v-for="t in toastStore.items"
          :key="t.id"
          :toast="t"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
