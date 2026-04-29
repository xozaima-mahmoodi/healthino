<script setup>
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, RouterLink } from 'vue-router'
import GlobalHeader from '../components/GlobalHeader.vue'
import { useHistoryStore } from '../stores/history'
import { useAuthStore } from '../stores/auth'

const { t, locale } = useI18n()
const route = useRoute()
const historyStore = useHistoryStore()
const authStore = useAuthStore()

const dateFormatter = computed(() => {
  const tag = locale.value === 'ckb' ? 'ckb-Arab' : 'fa-IR'
  try {
    return new Intl.DateTimeFormat(tag, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  }
})

function formatDate(iso) {
  if (!iso) return ''
  try {
    return dateFormatter.value.format(new Date(iso))
  } catch {
    return iso
  }
}

function localizedSymptom(slug) {
  if (!slug) return ''
  const key = `symptoms.${slug}`
  const translated = t(key)
  return translated === key ? slug : translated
}

function localizedBodyArea(slug) {
  if (!slug) return ''
  const key = `body_areas.${slug}`
  const translated = t(key)
  return translated === key ? slug : translated
}

function intensityTone(n) {
  if (n >= 8) return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
  if (n >= 5) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
}

onMounted(() => {
  if (!authStore.isAuthenticated) return
  const userId = route.query.user_id ? Number(route.query.user_id) : undefined
  historyStore.fetch({ userId })
})
</script>

<template>
  <main class="min-h-screen mesh-bg">
    <GlobalHeader />

    <section class="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {{ t('history.title') }}
        </h1>
        <p
          v-if="historyStore.patient && historyStore.viewingAs === 'doctor'"
          data-testid="history-doctor-banner"
          class="mb-4 text-sm rounded-lg px-3 py-2
                 bg-sky-50 dark:bg-sky-950/40
                 text-sky-800 dark:text-sky-200
                 border border-sky-200 dark:border-sky-700/40"
        >
          {{ t('history.viewing_patient', { name: historyStore.patient.name }) }}
        </p>

        <div
          v-if="!authStore.isAuthenticated"
          data-testid="history-needs-auth"
          class="rounded-2xl p-6 text-center space-y-4
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk
                 text-slate-600 dark:text-slate-300"
        >
          <p>{{ t('history.sign_in_required') }}</p>
          <RouterLink
            to="/login?next=/history"
            class="inline-flex items-center justify-center px-5 py-2.5 rounded-lg
                   bg-brand text-white font-semibold shadow-md hover:bg-brand-dark transition"
          >
            {{ t('auth.sign_in') }}
          </RouterLink>
        </div>

        <div
          v-else-if="historyStore.loading"
          data-testid="history-loading"
          class="rounded-2xl p-6 text-center
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 shadow-glass dark:shadow-glass-dk
                 text-slate-500 dark:text-slate-400 animate-pulse"
        >
          {{ t('history.loading') }}
        </div>

        <div
          v-else-if="historyStore.error"
          data-testid="history-error"
          class="rounded-2xl p-6 text-center
                 bg-red-50 dark:bg-red-950/40
                 border border-red-200 dark:border-red-700/40
                 text-red-800 dark:text-red-200"
        >
          {{ t('history.error') }}
        </div>

        <div
          v-else-if="historyStore.items.length === 0"
          data-testid="history-empty"
          class="rounded-2xl p-8 text-center
                 bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk
                 text-slate-500 dark:text-slate-400"
        >
          {{ t('history.empty') }}
        </div>

        <ol
          v-else
          data-testid="history-timeline"
          class="relative ps-8"
        >
          <span class="absolute top-2 bottom-2 start-3 w-px bg-slate-200 dark:bg-slate-700"
                aria-hidden="true"></span>

          <li
            v-for="a in historyStore.items"
            :key="a.id"
            data-testid="history-item"
            :data-id="a.id"
            class="relative pb-6 last:pb-0"
          >
            <span
              class="absolute -start-6 top-3 h-3 w-3 rounded-full
                     bg-brand ring-4 ring-white dark:ring-slate-950"
              aria-hidden="true"
            ></span>

            <article
              class="rounded-2xl p-5
                     bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                     border border-white/60 dark:border-white/10
                     ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                     shadow-glass dark:shadow-glass-dk"
            >
              <div class="flex items-center justify-between gap-3 mb-2">
                <time
                  :datetime="a.created_at"
                  class="text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  {{ formatDate(a.created_at) }}
                </time>
                <span
                  data-testid="history-item-intensity"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  :class="intensityTone(a.intensity)"
                >
                  {{ t('history.intensity_label') }}: {{ a.intensity }}/10
                </span>
              </div>

              <h2
                class="text-lg font-semibold text-slate-900 dark:text-slate-100"
                data-testid="history-item-symptom"
              >
                {{ localizedSymptom(a.primary_symptom) }}
              </h2>

              <dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div v-if="a.body_area">
                  <dt class="inline text-slate-500 dark:text-slate-400">{{ t('history.body_area_label') }}:</dt>
                  <dd class="inline ms-1 text-slate-700 dark:text-slate-200">
                    {{ localizedBodyArea(a.body_area) }}
                  </dd>
                </div>
                <div v-if="a.duration_hours">
                  <dt class="inline text-slate-500 dark:text-slate-400">{{ t('history.duration_label') }}:</dt>
                  <dd class="inline ms-1 text-slate-700 dark:text-slate-200">
                    {{ a.duration_hours }}h
                  </dd>
                </div>
              </dl>

              <p
                v-if="a.additional_info"
                data-testid="history-item-notes"
                class="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line"
              >
                {{ a.additional_info }}
              </p>

              <div
                v-if="a.result?.specialty?.name"
                data-testid="history-item-specialty"
                class="mt-3 inline-flex items-center gap-2 rounded-lg
                       px-3 py-1.5 text-sm
                       bg-brand-soft dark:bg-emerald-900/30
                       text-brand-dark dark:text-emerald-200
                       border border-emerald-200/60 dark:border-emerald-700/30"
              >
                <span class="text-xs text-slate-500 dark:text-slate-400">{{ t('history.recommended_specialty') }}:</span>
                <span class="font-semibold">{{ a.result.specialty.name }}</span>
              </div>
            </article>
          </li>
        </ol>
      </div>
    </section>
  </main>
</template>
