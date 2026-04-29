import { onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

// 15-minute inactivity window before we sign the user out.
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

export function useIdleLogout({ timeoutMs = IDLE_TIMEOUT_MS } = {}) {
  const router = useRouter()
  const { t } = useI18n()
  const auth = useAuthStore()
  const toast = useToastStore()

  let timer = null
  let attached = false

  function clear() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function onIdle() {
    timer = null
    if (!auth.isAuthenticated) return
    auth.logout()
    toast.info(t('toast.idle_logout'))
    router.push('/')
  }

  function reset() {
    clear()
    if (!auth.isAuthenticated) return
    timer = setTimeout(onIdle, timeoutMs)
  }

  function attach() {
    if (attached) return
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true })
    }
    attached = true
    reset()
  }

  function detach() {
    if (attached) {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, reset)
      attached = false
    }
    clear()
  }

  watch(
    () => auth.isAuthenticated,
    (now) => { now ? attach() : detach() },
    { immediate: true }
  )

  onBeforeUnmount(detach)

  return { reset }
}
