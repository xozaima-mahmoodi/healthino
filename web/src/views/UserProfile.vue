<script setup>
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GlobalHeader from '../components/GlobalHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { sanitizeEmail } from '../utils/text'

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const PASSWORD_MIN_LENGTH = 8

const editing = ref(false)
const justSaved = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const form = reactive({
  name: '',
  email: '',
  password: '',
  password_confirmation: ''
})

function syncFormFromUser() {
  form.name = auth.user?.name || ''
  form.email = auth.user?.email || ''
  form.password = ''
  form.password_confirmation = ''
}

const cleanEmail = computed(() => sanitizeEmail(form.email))

const errorMessages = computed(() => {
  const e = auth.error
  if (!e) return []
  if (e.errors && typeof e.errors === 'object') {
    return Object.entries(e.errors).flatMap(([field, msgs]) =>
      [].concat(msgs).filter(Boolean).map(m => `${field}: ${m}`)
    )
  }
  if (e.message) return [String(e.message)]
  return []
})

const wantsPasswordChange = computed(
  () => form.password.length > 0 || form.password_confirmation.length > 0
)

const passwordsMatch = computed(
  () => !wantsPasswordChange.value || form.password === form.password_confirmation
)

const passwordTooShort = computed(
  () => wantsPasswordChange.value && form.password.length < PASSWORD_MIN_LENGTH
)

const passwordError = computed(() => {
  if (!wantsPasswordChange.value) return ''
  if (passwordTooShort.value) return t('profile.password_too_short')
  if (!passwordsMatch.value) return t('profile.password_mismatch')
  return ''
})

const canSubmit = computed(() =>
  !auth.submitting &&
  form.name.trim().length >= 2 &&
  cleanEmail.value.includes('@') &&
  cleanEmail.value.length > 3 &&
  (!wantsPasswordChange.value || (passwordsMatch.value && !passwordTooShort.value))
)

const dateFormatter = computed(() => {
  const tag = locale.value === 'ckb' ? 'ckb-Arab'
            : locale.value === 'en'  ? 'en-US'
            : 'fa-IR'
  try {
    return new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }
})

const joinedDisplay = computed(() => {
  const iso = auth.user?.created_at
  if (!iso) return '—'
  try {
    return dateFormatter.value.format(new Date(iso))
  } catch {
    return iso
  }
})

function startEdit() {
  syncFormFromUser()
  auth.error = null
  justSaved.value = false
  showNewPassword.value = false
  showConfirmPassword.value = false
  editing.value = true
}

function cancelEdit() {
  syncFormFromUser()
  auth.error = null
  showNewPassword.value = false
  showConfirmPassword.value = false
  editing.value = false
}

async function save() {
  if (!canSubmit.value) return
  const payload = {
    name: form.name.trim(),
    email: cleanEmail.value
  }
  const passwordChanged = wantsPasswordChange.value
  if (passwordChanged) {
    payload.password = form.password
    payload.password_confirmation = form.password_confirmation
  }
  const ok = await auth.updateProfile(payload)
  if (ok) {
    editing.value = false
    justSaved.value = true
    toast.success(
      passwordChanged
        ? t('toast.password_update_success')
        : t('toast.profile_update_success')
    )
  } else {
    toast.error(t('toast.profile_update_error'))
  }
}

watch(() => auth.user, () => {
  if (!editing.value) syncFormFromUser()
}, { immediate: true })

onMounted(() => {
  if (auth.isAuthenticated && !auth.user?.created_at) {
    auth.fetchMe()
  }
})
</script>

<template>
  <main class="min-h-screen mesh-bg">
    <GlobalHeader />

    <section class="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
      <div class="max-w-xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {{ t('profile.title') }}
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {{ t('profile.subtitle') }}
        </p>

        <div
          v-if="!auth.isAuthenticated"
          data-testid="profile-needs-auth"
          class="rounded-2xl p-5 sm:p-6 text-center
                 bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
                 sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk
                 text-slate-600 dark:text-slate-300"
        >
          {{ t('profile.sign_in_required') }}
        </div>

        <div
          v-else
          data-testid="profile-card"
          class="rounded-2xl p-5 sm:p-8 space-y-5 sm:space-y-6
                 bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
                 sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk"
        >
          <div class="flex items-center gap-4">
            <div class="inline-flex h-14 w-14 items-center justify-center rounded-full
                        bg-gradient-to-br from-emerald-500 to-emerald-700
                        text-white shadow-md shadow-brand/20">
              <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div class="min-w-0">
              <p
                data-testid="profile-display-name"
                class="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate"
              >
                {{ auth.displayName }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
                {{ auth.user?.email }}
              </p>
            </div>
          </div>

          <div
            v-if="justSaved"
            data-testid="profile-saved"
            role="status"
            class="rounded-xl p-3 text-sm
                   bg-emerald-50 dark:bg-emerald-950/40
                   border border-emerald-200 dark:border-emerald-700/40
                   text-emerald-800 dark:text-emerald-200"
          >
            {{ t('profile.saved') }}
          </div>

          <div
            v-if="errorMessages.length"
            data-testid="profile-error"
            role="alert"
            class="rounded-xl p-3 text-sm
                   bg-red-50 dark:bg-red-950/40
                   border border-red-200 dark:border-red-700/40
                   text-red-800 dark:text-red-200"
          >
            <ul class="list-disc ps-5 space-y-0.5">
              <li v-for="(msg, i) in errorMessages" :key="i">{{ msg }}</li>
            </ul>
          </div>

          <dl
            v-if="!editing"
            data-testid="profile-view"
            class="space-y-4 text-sm"
          >
            <div>
              <dt class="text-slate-500 dark:text-slate-400">{{ t('profile.name_label') }}</dt>
              <dd
                data-testid="profile-name-text"
                class="mt-1 text-base text-slate-800 dark:text-slate-100"
              >
                {{ auth.user?.name || '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-slate-500 dark:text-slate-400">{{ t('profile.email_label') }}</dt>
              <dd
                data-testid="profile-email-text"
                class="mt-1 text-base text-slate-800 dark:text-slate-100 break-all"
              >
                {{ auth.user?.email || '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-slate-500 dark:text-slate-400">{{ t('profile.joined_label') }}</dt>
              <dd
                data-testid="profile-joined-text"
                class="mt-1 text-base text-slate-800 dark:text-slate-100"
              >
                {{ joinedDisplay }}
              </dd>
            </div>

            <div class="pt-2">
              <button
                type="button"
                data-testid="profile-edit-button"
                @click="startEdit"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                       bg-brand text-white font-semibold shadow-md
                       hover:bg-brand-dark transition"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
                {{ t('profile.edit') }}
              </button>
            </div>
          </dl>

          <form
            v-else
            data-testid="profile-edit-form"
            class="space-y-4"
            novalidate
            @submit.prevent="save"
          >
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {{ t('profile.name_label') }}
              </label>
              <input
                v-model="form.name"
                type="text"
                autocomplete="name"
                required
                minlength="2"
                data-testid="profile-name-input"
                class="w-full px-4 py-3 rounded-lg
                       bg-white dark:bg-slate-900/60
                       border border-slate-300 dark:border-slate-600
                       text-slate-800 dark:text-slate-100
                       focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {{ t('profile.email_label') }}
              </label>
              <input
                v-model="form.email"
                type="email"
                autocomplete="email"
                required
                data-testid="profile-email-input"
                class="w-full px-4 py-3 rounded-lg
                       bg-white dark:bg-slate-900/60
                       border border-slate-300 dark:border-slate-600
                       text-slate-800 dark:text-slate-100
                       focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>

            <div
              data-testid="profile-password-section"
              class="rounded-xl border border-slate-200/80 dark:border-white/10
                     bg-white/60 dark:bg-slate-900/30 p-4 space-y-3"
            >
              <div>
                <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {{ t('profile.password_section_title') }}
                </p>
                <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {{ t('profile.password_section_hint') }}
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {{ t('profile.new_password_label') }}
                </label>
                <div class="relative">
                  <input
                    v-model="form.password"
                    :type="showNewPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    minlength="8"
                    data-testid="profile-new-password-input"
                    :aria-invalid="passwordTooShort || (wantsPasswordChange && !passwordsMatch)"
                    class="w-full ps-4 pe-11 py-3 rounded-lg
                           bg-white dark:bg-slate-900/60
                           border border-slate-300 dark:border-slate-600
                           text-slate-800 dark:text-slate-100
                           focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                  <button
                    type="button"
                    data-testid="profile-new-password-toggle"
                    :aria-label="showNewPassword ? t('profile.hide_password') : t('profile.show_password')"
                    :title="showNewPassword ? t('profile.hide_password') : t('profile.show_password')"
                    @click="showNewPassword = !showNewPassword"
                    class="absolute inset-y-0 end-2 inline-flex h-full w-9 items-center justify-center
                           text-slate-500 dark:text-slate-300 hover:text-brand-dark dark:hover:text-emerald-300
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring rounded-md"
                  >
                    <svg v-if="!showNewPassword" class="h-5 w-5" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <svg v-else class="h-5 w-5" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 4.22-5.34"/>
                      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.66 19.66 0 0 1-3.18 4.19"/>
                      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>
                      <path d="M1 1l22 22"/>
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {{ t('profile.confirm_password_label') }}
                </label>
                <div class="relative">
                  <input
                    v-model="form.password_confirmation"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    minlength="8"
                    data-testid="profile-confirm-password-input"
                    :aria-invalid="wantsPasswordChange && !passwordsMatch"
                    class="w-full ps-4 pe-11 py-3 rounded-lg
                           bg-white dark:bg-slate-900/60
                           border border-slate-300 dark:border-slate-600
                           text-slate-800 dark:text-slate-100
                           focus:ring-2 focus:ring-brand focus:outline-none"
                  />
                  <button
                    type="button"
                    data-testid="profile-confirm-password-toggle"
                    :aria-label="showConfirmPassword ? t('profile.hide_password') : t('profile.show_password')"
                    :title="showConfirmPassword ? t('profile.hide_password') : t('profile.show_password')"
                    @click="showConfirmPassword = !showConfirmPassword"
                    class="absolute inset-y-0 end-2 inline-flex h-full w-9 items-center justify-center
                           text-slate-500 dark:text-slate-300 hover:text-brand-dark dark:hover:text-emerald-300
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring rounded-md"
                  >
                    <svg v-if="!showConfirmPassword" class="h-5 w-5" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <svg v-else class="h-5 w-5" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 4.22-5.34"/>
                      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.66 19.66 0 0 1-3.18 4.19"/>
                      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>
                      <path d="M1 1l22 22"/>
                    </svg>
                  </button>
                </div>
              </div>

              <p
                v-if="passwordError"
                data-testid="profile-password-error"
                role="alert"
                class="text-xs text-red-600 dark:text-red-400"
              >
                {{ passwordError }}
              </p>
            </div>

            <div>
              <p class="text-sm text-slate-500 dark:text-slate-400">
                {{ t('profile.joined_label') }}: {{ joinedDisplay }}
              </p>
            </div>

            <div class="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3 pt-2">
              <button
                type="submit"
                :disabled="!canSubmit"
                data-testid="profile-save-button"
                class="inline-flex items-center justify-center w-full sm:w-auto px-5 py-2.5 rounded-lg
                       bg-brand text-white font-semibold shadow-md
                       hover:bg-brand-dark transition disabled:opacity-50"
              >
                {{ auth.submitting ? t('profile.saving') : t('profile.save') }}
              </button>
              <button
                type="button"
                data-testid="profile-cancel-button"
                @click="cancelEdit"
                class="inline-flex items-center justify-center w-full sm:w-auto px-5 py-2.5 rounded-lg
                       bg-white/80 dark:bg-slate-700/60
                       border border-slate-300 dark:border-slate-600
                       text-slate-700 dark:text-slate-200
                       hover:bg-white dark:hover:bg-slate-700 transition"
              >
                {{ t('profile.cancel') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  </main>
</template>
