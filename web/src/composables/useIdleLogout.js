import { onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

// Two-phase idle handling:
//   Phase 1 — inactivity window. When it elapses we open a warning modal.
//   Phase 2 — warning countdown. If the user does nothing we force a logout.
// The medical-data policy is enforced identically in every environment: a
// 15-minute inactivity window followed by a 60-second warning countdown. There
// is no development shortcut — the production timings are strict everywhere.
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000        // 900s inactivity window
export const WARNING_TIMEOUT_MS = 60 * 1000          // 60s warning countdown

export const DEFAULT_IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MS
export const DEFAULT_WARNING_TIMEOUT_MS = WARNING_TIMEOUT_MS

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

export function useIdleLogout({
  idleMs = DEFAULT_IDLE_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_TIMEOUT_MS
} = {}) {
  const router = useRouter()
  const { t } = useI18n()
  const auth = useAuthStore()
  const toast = useToastStore()

  // Reactive state consumed by the warning modal.
  const showWarning = ref(false)
  const secondsRemaining = ref(0)

  let idleTimer = null
  let warningTimer = null
  let countdownInterval = null
  let attached = false

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function clearWarningTimers() {
    if (warningTimer) {
      clearTimeout(warningTimer)
      warningTimer = null
    }
    if (countdownInterval) {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
  }

  // Phase 2: open the warning modal and run the visible countdown. The
  // authoritative force-logout is a single timeout; the interval only updates
  // the displayed seconds.
  function startWarning() {
    idleTimer = null
    if (!auth.isAuthenticated) return
    secondsRemaining.value = Math.ceil(warningMs / 1000)
    showWarning.value = true
    warningTimer = setTimeout(forceLogout, warningMs)
    countdownInterval = setInterval(() => {
      secondsRemaining.value = Math.max(0, secondsRemaining.value - 1)
    }, 1000)
  }

  function forceLogout() {
    clearWarningTimers()
    showWarning.value = false
    if (!auth.isAuthenticated) return
    auth.logout()
    toast.error(t('toast.idle_logout'))   // red toast — session ended by inactivity
    router.push('/login')
  }

  // Phase 1: (re)arm the inactivity timer. Ignored while the warning modal is
  // open so a stray mouse nudge can't silently cancel the countdown.
  function reset() {
    if (showWarning.value) return
    clearIdleTimer()
    if (!auth.isAuthenticated) return
    idleTimer = setTimeout(startWarning, idleMs)
  }

  // "Stay Logged In" — dismiss the modal and restart the inactivity window.
  function stayLoggedIn() {
    clearWarningTimers()
    showWarning.value = false
    reset()
  }

  // "Logout Now" — immediate manual logout flow.
  function logoutNow() {
    clearWarningTimers()
    showWarning.value = false
    if (!auth.isAuthenticated) return
    auth.logout()
    toast.success(t('toast.logout_success'))
    router.push('/login')
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
    clearIdleTimer()
    clearWarningTimers()
    showWarning.value = false
  }

  watch(
    () => auth.isAuthenticated,
    (now) => { now ? attach() : detach() },
    { immediate: true }
  )

  onBeforeUnmount(detach)

  return { showWarning, secondsRemaining, stayLoggedIn, logoutNow, reset }
}
