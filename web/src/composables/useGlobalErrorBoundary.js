import { onBeforeUnmount, onErrorCaptured, onMounted } from 'vue'
import { useToastStore } from '../stores/toast'

const SUPPRESS_DURATION_MS = 4000
let lastErrorAt = 0

function shouldEmit() {
  const now = Date.now()
  if (now - lastErrorAt < SUPPRESS_DURATION_MS) return false
  lastErrorAt = now
  return true
}

function describe(err) {
  if (!err) return 'unknown'
  if (typeof err === 'string') return err
  if (err.message) return err.message
  try { return JSON.stringify(err) } catch { return String(err) }
}

export function useGlobalErrorBoundary({ message } = {}) {
  const toast = useToastStore()

  function emit(label, err) {
    const code = err?.code
    if (code === 'ERR_CANCELED') return
    console.warn(`[boundary] ${label}:`, describe(err))
    if (!shouldEmit()) return
    if (message) toast.error(message)
  }

  function onUnhandledRejection(event) {
    emit('unhandledrejection', event?.reason)
  }
  function onWindowError(event) {
    emit('window.onerror', event?.error || event?.message)
  }

  onErrorCaptured((err, _instance, info) => {
    emit(`vue:${info}`, err)
    return false
  })

  onMounted(() => {
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    window.addEventListener('error', onWindowError)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    window.removeEventListener('error', onWindowError)
  })
}
