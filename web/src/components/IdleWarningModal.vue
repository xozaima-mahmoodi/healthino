<script setup>
import { useI18n } from 'vue-i18n'
import { useIdleLogout } from '../composables/useIdleLogout'

const { t } = useI18n()
const { showWarning, secondsRemaining, stayLoggedIn, logoutNow } = useIdleLogout()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="showWarning"
        data-testid="idle-warning-modal"
        role="alertdialog"
        aria-modal="true"
        :aria-label="t('idle_warning.title')"
        class="fixed inset-0 z-[300] flex items-center justify-center p-4
               bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm"
      >
        <Transition name="modal-pop" appear>
          <div
            v-if="showWarning"
            class="w-full max-w-md rounded-2xl p-5 sm:p-7 space-y-5
                   bg-white/90 dark:bg-slate-800/70 backdrop-blur-xl
                   border border-white/60 dark:border-white/10
                   ring-1 ring-slate-900/5 dark:ring-amber-400/20
                   shadow-glass dark:shadow-glass-dk"
          >
            <div class="flex items-center gap-3">
              <div class="inline-flex h-10 w-10 items-center justify-center
                          rounded-xl bg-gradient-to-br from-amber-500 to-amber-600
                          text-white shadow-md shadow-amber-500/30">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                  <path d="M12 9v4"/>
                  <path d="M12 17h.01"/>
                </svg>
              </div>
              <h2 class="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">
                {{ t('idle_warning.title') }}
              </h2>
            </div>

            <p
              data-testid="idle-warning-message"
              class="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
            >
              {{ t('idle_warning.message', { seconds: secondsRemaining }) }}
            </p>

            <div class="flex items-center justify-center">
              <div
                data-testid="idle-warning-countdown"
                class="inline-flex h-16 w-16 items-center justify-center rounded-full
                       bg-amber-50/80 dark:bg-amber-900/30
                       border border-amber-200/80 dark:border-amber-700/40
                       text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-300"
              >
                {{ secondsRemaining }}
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                data-testid="idle-stay-button"
                @click="stayLoggedIn"
                class="w-full py-3 rounded-lg bg-brand text-white font-semibold
                       shadow-md hover:bg-brand-dark transition"
              >
                {{ t('idle_warning.stay') }}
              </button>
              <button
                type="button"
                data-testid="idle-logout-button"
                @click="logoutNow"
                class="w-full py-3 rounded-lg font-semibold transition
                       bg-white/85 dark:bg-slate-900/60 backdrop-blur-md
                       border border-slate-200 dark:border-white/10
                       text-red-600 dark:text-red-300
                       hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                {{ t('idle_warning.logout_now') }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 220ms ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-pop-enter-active {
  transition: opacity 260ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-pop-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.modal-pop-enter-from,
.modal-pop-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}
</style>
