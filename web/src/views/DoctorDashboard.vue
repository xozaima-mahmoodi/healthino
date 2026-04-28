<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import GlobalHeader from '../components/GlobalHeader.vue'
import { useAuthStore } from '../stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const RECENT_KEY = 'healthino:doctor_recent_patients'

const patientId = ref('')
const recent = ref([])

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    recent.value = raw ? JSON.parse(raw).filter(n => Number.isInteger(n)) : []
  } catch {
    recent.value = []
  }
}

function pushRecent(id) {
  const next = [id, ...recent.value.filter(x => x !== id)].slice(0, 8)
  recent.value = next
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

const canSubmit = computed(() => {
  const n = Number(patientId.value)
  return Number.isInteger(n) && n > 0
})

function viewPatient(id) {
  pushRecent(id)
  router.push({ path: '/history', query: { user_id: id } })
}

function onSubmit() {
  if (!canSubmit.value) return
  viewPatient(Number(patientId.value))
}

onMounted(loadRecent)
</script>

<template>
  <main class="min-h-screen mesh-bg">
    <GlobalHeader />

    <section class="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {{ t('doctor.title') }}
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {{ t('doctor.subtitle') }}
        </p>

        <div
          v-if="!authStore.isAuthenticated"
          data-testid="doctor-needs-auth"
          class="rounded-2xl p-6 text-center
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk
                 text-slate-600 dark:text-slate-300"
        >
          {{ t('doctor.sign_in_required') }}
        </div>

        <div
          v-else
          data-testid="doctor-dashboard-card"
          class="rounded-2xl p-6
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk space-y-5"
        >
          <form class="space-y-3" @submit.prevent="onSubmit">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {{ t('doctor.patient_id_label') }}
            </label>
            <div class="flex items-stretch gap-2">
              <input
                v-model="patientId"
                type="number"
                inputmode="numeric"
                min="1"
                data-testid="doctor-patient-id-input"
                :placeholder="t('doctor.patient_id_placeholder')"
                class="flex-1 px-4 py-3 rounded-lg
                       bg-white dark:bg-slate-900/60
                       border border-slate-300 dark:border-slate-600
                       text-slate-800 dark:text-slate-100
                       placeholder:text-slate-400 dark:placeholder:text-slate-500
                       focus:ring-2 focus:ring-brand focus:outline-none"
              />
              <button
                type="submit"
                :disabled="!canSubmit"
                data-testid="doctor-view-button"
                class="px-5 rounded-lg bg-brand text-white font-semibold
                       shadow-md hover:bg-brand-dark transition disabled:opacity-50"
              >
                {{ t('doctor.view_history') }}
              </button>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ t('doctor.permission_hint') }}
            </p>
          </form>

          <div v-if="recent.length" data-testid="doctor-recent-list">
            <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {{ t('doctor.recent_patients') }}
            </h2>
            <ul class="flex flex-wrap gap-2">
              <li v-for="id in recent" :key="id">
                <button
                  type="button"
                  data-testid="doctor-recent-item"
                  :data-id="id"
                  @click="viewPatient(id)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm
                         bg-white/80 dark:bg-slate-800/60 backdrop-blur-md
                         border border-white/60 dark:border-white/10
                         ring-1 ring-slate-900/5 dark:ring-white/5
                         text-slate-700 dark:text-slate-200
                         hover:bg-brand-soft dark:hover:bg-emerald-900/30
                         hover:text-brand-dark dark:hover:text-emerald-200
                         transition"
                >
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" stroke-width="2"
                       stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 21v-1a8 8 0 0 1 16 0v1"/>
                  </svg>
                  #{{ id }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
