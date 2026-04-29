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
      class="pointer-events-none fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[200]
             w-full max-w-sm sm:max-w-md px-3 sm:px-0
             flex flex-col-reverse gap-2 items-center"
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
  transition: opacity 220ms ease, transform 220ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
