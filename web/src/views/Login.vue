<script setup>
import { reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import GlobalHeader from '../components/GlobalHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { sanitizeEmail } from '../utils/text'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const toast = useToastStore()

const form = reactive({ email: '', password: '' })

const cleanEmail = computed(() => sanitizeEmail(form.email))

const errorMessages = computed(() => {
  const e = auth.error
  if (!e) return []
  if (e.errors && typeof e.errors === 'object') {
    return Object.values(e.errors).flat().filter(Boolean).map(String)
  }
  if (e.message) return [String(e.message)]
  return []
})

const canSubmit = computed(() =>
  !auth.submitting &&
  cleanEmail.value.includes('@') &&
  cleanEmail.value.length > 3 &&
  form.password.length >= 6
)

async function submit() {
  if (!canSubmit.value) return
  const ok = await auth.login({ email: cleanEmail.value, password: form.password })
  if (ok) {
    toast.success(t('toast.login_success'))
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    router.push(next)
  } else {
    toast.error(t('toast.login_error'))
  }
}
</script>

<template>
  <main class="min-h-screen mesh-bg">
    <GlobalHeader />

    <section class="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-16">
      <div class="max-w-md mx-auto">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {{ t('auth.login_title') }}
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {{ t('auth.login_subtitle') }}
        </p>

        <div
          data-testid="login-card"
          class="rounded-2xl p-5 sm:p-7 space-y-5
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk"
        >
          <form class="space-y-4" novalidate @submit.prevent="submit">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {{ t('auth.email_label') }}
              </label>
              <input
                v-model="form.email"
                type="email"
                autocomplete="email"
                required
                data-testid="login-email"
                :placeholder="t('auth.email_placeholder')"
                class="w-full px-4 py-3 rounded-lg
                       bg-white dark:bg-slate-900/60
                       border border-slate-300 dark:border-slate-600
                       text-slate-800 dark:text-slate-100
                       placeholder:text-slate-400 dark:placeholder:text-slate-500
                       focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {{ t('auth.password_label') }}
              </label>
              <input
                v-model="form.password"
                type="password"
                autocomplete="current-password"
                required
                minlength="6"
                data-testid="login-password"
                class="w-full px-4 py-3 rounded-lg
                       bg-white dark:bg-slate-900/60
                       border border-slate-300 dark:border-slate-600
                       text-slate-800 dark:text-slate-100
                       focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>

            <div
              v-if="errorMessages.length"
              data-testid="login-error"
              role="alert"
              class="rounded-xl p-3 text-sm
                     bg-red-50 dark:bg-red-950/40
                     border border-red-200 dark:border-red-700/40
                     text-red-800 dark:text-red-200"
            >
              <ul class="list-disc ps-5 space-y-0.5">
                <li v-for="(msg, i) in errorMessages" :key="i">
                  {{ msg === 'invalid_credentials' ? t('auth.invalid_credentials') : msg }}
                </li>
              </ul>
            </div>

            <button
              type="submit"
              :disabled="!canSubmit"
              data-testid="login-submit"
              class="w-full py-3 rounded-lg bg-brand text-white font-semibold
                     shadow-md hover:bg-brand-dark transition disabled:opacity-50"
            >
              {{ auth.submitting ? t('auth.signing_in') : t('auth.sign_in') }}
            </button>
          </form>

          <p class="text-sm text-center text-slate-600 dark:text-slate-300">
            {{ t('auth.no_account') }}
            <RouterLink
              to="/register"
              data-testid="login-go-register"
              class="ms-1 font-semibold text-brand-dark dark:text-emerald-300 hover:underline"
            >
              {{ t('auth.go_register') }}
            </RouterLink>
          </p>
        </div>
      </div>
    </section>
  </main>
</template>
