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

const editing = ref(false)
const justSaved = ref(false)
const form = reactive({ name: '', email: '' })

function syncFormFromUser() {
  form.name = auth.user?.name || ''
  form.email = auth.user?.email || ''
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

const canSubmit = computed(() =>
  !auth.submitting &&
  form.name.trim().length >= 2 &&
  cleanEmail.value.includes('@') &&
  cleanEmail.value.length > 3
)

const dateFormatter = computed(() => {
  const tag = locale.value === 'ckb' ? 'ckb-Arab' : 'fa-IR'
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
  editing.value = true
}

function cancelEdit() {
  syncFormFromUser()
  auth.error = null
  editing.value = false
}

async function save() {
  if (!canSubmit.value) return
  const ok = await auth.updateProfile({
    name: form.name.trim(),
    email: cleanEmail.value
  })
  if (ok) {
    editing.value = false
    justSaved.value = true
    toast.success(t('toast.profile_update_success'))
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
          class="rounded-2xl p-6 text-center
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
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
          class="rounded-2xl p-6 sm:p-8 space-y-6
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
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

            <div>
              <p class="text-sm text-slate-500 dark:text-slate-400">
                {{ t('profile.joined_label') }}: {{ joinedDisplay }}
              </p>
            </div>

            <div class="flex items-center gap-3 pt-2">
              <button
                type="submit"
                :disabled="!canSubmit"
                data-testid="profile-save-button"
                class="inline-flex items-center px-5 py-2.5 rounded-lg
                       bg-brand text-white font-semibold shadow-md
                       hover:bg-brand-dark transition disabled:opacity-50"
              >
                {{ auth.submitting ? t('profile.saving') : t('profile.save') }}
              </button>
              <button
                type="button"
                data-testid="profile-cancel-button"
                @click="cancelEdit"
                class="inline-flex items-center px-5 py-2.5 rounded-lg
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
