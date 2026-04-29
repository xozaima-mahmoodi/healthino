<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '../stores/toast'

const props = defineProps({
  toast: { type: Object, required: true }
})

const { t } = useI18n()
const toastStore = useToastStore()

const variant = computed(() => {
  switch (props.toast.type) {
    case 'success':
      return {
        ring: 'ring-emerald-400/40 dark:ring-emerald-300/30',
        accent: 'bg-emerald-500/90 dark:bg-emerald-400/90',
        text: 'text-emerald-900 dark:text-emerald-100',
        icon: 'check'
      }
    case 'error':
      return {
        ring: 'ring-red-400/50 dark:ring-red-300/30',
        accent: 'bg-red-500/90 dark:bg-red-400/90',
        text: 'text-red-900 dark:text-red-100',
        icon: 'cross'
      }
    default:
      return {
        ring: 'ring-slate-300/60 dark:ring-white/10',
        accent: 'bg-slate-500/80 dark:bg-slate-300/70',
        text: 'text-slate-800 dark:text-slate-100',
        icon: 'info'
      }
  }
})

function close() {
  toastStore.dismiss(props.toast.id)
}
</script>

<template>
  <div
    role="status"
    :data-testid="`toast-${toast.type}`"
    :data-toast-id="toast.id"
    class="pointer-events-auto relative flex items-start gap-3 ps-3 pe-4 py-3 min-w-[260px] max-w-sm rounded-2xl
           bg-white/85 dark:bg-slate-800/70 backdrop-blur-xl
           border border-white/60 dark:border-white/10
           ring-1 shadow-glass dark:shadow-glass-dk
           overflow-hidden"
    :class="variant.ring"
  >
    <span
      aria-hidden="true"
      class="absolute inset-y-0 start-0 w-1.5"
      :class="variant.accent"
    ></span>

    <span
      aria-hidden="true"
      class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
      :class="variant.accent"
    >
      <svg v-if="variant.icon === 'check'" class="h-4 w-4" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
      <svg v-else-if="variant.icon === 'cross'" class="h-4 w-4" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
      <svg v-else class="h-4 w-4" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.4"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 8h.01M11 12h1v4h1"/>
      </svg>
    </span>

    <p
      data-testid="toast-message"
      class="flex-1 text-sm leading-snug font-medium"
      :class="variant.text"
    >
      {{ toast.message }}
    </p>

    <button
      type="button"
      data-testid="toast-dismiss"
      :aria-label="t('toast.dismiss')"
      :title="t('toast.dismiss')"
      @click="close"
      class="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full
             text-slate-500 dark:text-slate-300
             hover:bg-slate-100/80 dark:hover:bg-white/10
             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring
             transition"
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>
  </div>
</template>
