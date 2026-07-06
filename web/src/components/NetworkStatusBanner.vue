<script setup>
// Offline Connectivity Guardian — a floating glassmorphic capsule that reacts
// to the browser's network state. It surfaces a calm "we're saving offline"
// notice the moment connectivity drops, then flashes a brief success capsule on
// reconnect before quietly retiring itself. Mounted once globally from App.vue.
import { onMounted, onUnmounted, ref } from 'vue'

// 'hidden' | 'offline' | 'reconnected'
const status = ref('hidden')
let reconnectTimer = null

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function handleOffline() {
  clearReconnectTimer()
  status.value = 'offline'
}

function handleOnline() {
  // Only celebrate a reconnect if we were actually offline — this guards
  // against spurious 'online' events firing on initial mount.
  if (status.value !== 'offline') return
  clearReconnectTimer()
  status.value = 'reconnected'
  reconnectTimer = setTimeout(() => {
    status.value = 'hidden'
    reconnectTimer = null
  }, 2000)
}

onMounted(() => {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  // Reflect the state at mount time in case we boot up already offline.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    status.value = 'offline'
  }
})

onUnmounted(() => {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  clearReconnectTimer()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="capsule">
      <div
        v-if="status !== 'hidden'"
        role="status"
        aria-live="polite"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <!-- Offline: data is being preserved locally -->
        <div
          v-if="status === 'offline'"
          data-testid="network-status-offline"
          class="flex items-center gap-2 px-4 py-2 text-xs rounded-full shadow-lg
                 animate-fade-in-up
                 bg-rose-500/10 dark:bg-rose-500/20 backdrop-blur-xl
                 border border-rose-500/30 text-rose-500"
        >
          <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M2 2 22 22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 13a10 10 0 0 1 5.24-2.76" />
            <path d="M12 20h.01" />
          </svg>
          <span>ارتباط با شبکه قطع شد. در حال حفظ داده‌ها به‌صورت آفلاین...</span>
        </div>

        <!-- Reconnected: brief success flash -->
        <div
          v-else
          data-testid="network-status-reconnected"
          class="flex items-center gap-2 px-4 py-2 text-xs rounded-full shadow-lg
                 bg-emerald-500/10 dark:bg-emerald-500/20 backdrop-blur-xl
                 border border-emerald-500/30 text-emerald-500"
        >
          <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M5 12.5 10 17.5 20 7" />
          </svg>
          <span>اتصال مجدد با موفقیت برقرار شد</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Gentle enter/leave so the capsule settles in and out rather than snapping. */
.capsule-enter-active {
  transition: opacity 260ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.capsule-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.capsule-enter-from,
.capsule-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
