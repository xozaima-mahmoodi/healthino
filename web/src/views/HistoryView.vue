<script setup>
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, RouterLink } from 'vue-router'
import GlobalHeader from '../components/GlobalHeader.vue'
import { useHistoryStore } from '../stores/history'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { useHealthReport } from '../composables/useHealthReport'

const { t, locale } = useI18n()
const route = useRoute()
const historyStore = useHistoryStore()
const authStore = useAuthStore()
const toast = useToastStore()
const { printHealthReport } = useHealthReport()

const DATE_LOCALE_TAGS = { fa: 'fa-IR', ckb: 'ckb-Arab', en: 'en-US' }

const dateFormatter = computed(() => {
  const tag = DATE_LOCALE_TAGS[locale.value] || 'fa-IR'
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

// Derive a triage severity from the persisted result. `red_flag` is the
// clinical emergency signal; otherwise we fall back to reported intensity.
function severityCategory(a) {
  if (a.result?.red_flag) return 'emergency'
  if ((a.intensity ?? 0) >= 5) return 'warning'
  return 'stable'
}

// Glowing color-coded indicator dot per severity. Emergency pulses.
function severityDotClass(a) {
  switch (severityCategory(a)) {
    case 'emergency':
      return 'bg-rose-500 animate-pulse shadow-[0_0_12px_3px_rgba(244,63,94,0.55)]'
    case 'warning':
      return 'bg-amber-500 shadow-[0_0_12px_3px_rgba(245,158,11,0.5)]'
    default:
      return 'bg-emerald-500 shadow-[0_0_12px_3px_rgba(16,185,129,0.5)]'
  }
}

const relativeTimeFormatter = computed(() => {
  const tag = DATE_LOCALE_TAGS[locale.value] || 'fa-IR'
  try {
    return new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  }
})

// Localized "۲ روز پیش" style elapsed time. Numerals follow the active locale.
function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((then - Date.now()) / 1000) // negative for the past
  const abs = Math.abs(diffSec)
  const rtf = relativeTimeFormatter.value
  try {
    if (abs < 60) return rtf.format(Math.round(diffSec), 'second')
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
    if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day')
    if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month')
    return rtf.format(Math.round(diffSec / 31536000), 'year')
  } catch {
    return formatDate(iso)
  }
}

// Compact one-line summary of the symptoms the user actually typed.
function symptomSummary(a) {
  return [localizedSymptom(a.primary_symptom), a.additional_info]
    .filter(Boolean)
    .join(' · ')
}

// Export a past log as a branded PDF via the shared report composable. We map
// the stored assessment into the normalized record it expects; `first_aid` is
// not persisted with old assessments, so we fall back to the default care tips.
function exportHistoryItem(a) {
  const r = a.result || {}
  const isEmergency = !!r.red_flag || r.specialty?.slug === 'emergency'
  const careActions = Array.isArray(r.first_aid) && r.first_aid.length
    ? r.first_aid
    : [
        t('symptom_form.first_aid.default_1'),
        t('symptom_form.first_aid.default_2'),
        t('symptom_form.first_aid.default_3')
      ]
  const ok = printHealthReport({
    urgencyKey: isEmergency ? 'emergency' : 'routine',
    urgencyLabel: t(isEmergency ? 'symptom_form.urgency_emergency' : 'symptom_form.urgency_routine'),
    redFlag: !!r.red_flag,
    symptoms: [localizedSymptom(a.primary_symptom), a.additional_info].filter(Boolean),
    severity: Number.isFinite(a.intensity) ? a.intensity : null,
    bodyArea: a.body_area ? localizedBodyArea(a.body_area) : '',
    durationHours: Number.isFinite(a.duration_hours) ? a.duration_hours : null,
    specialtyName: r.specialty?.name || null,
    careActions,
    doctors: r.doctors || [],
    refId: `HLT-${r.symptom_log_id || a.id}`,
    issuedAt: a.created_at
  })
  if (!ok) toast.error(t('toast.unexpected_error'))
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
        <h1 class="text-center mx-auto text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
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
          class="rounded-2xl p-5 sm:p-6 text-center space-y-4
                 bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
                 sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk
                 text-slate-600 dark:text-slate-300"
        >
          <p>{{ t('history.sign_in_required') }}</p>
          <RouterLink
            to="/login"
            class="inline-flex items-center justify-center px-5 py-2.5 rounded-lg
                   bg-brand text-white font-semibold shadow-md hover:bg-brand-dark transition"
          >
            {{ t('auth.sign_in') }}
          </RouterLink>
        </div>

        <div
          v-else-if="historyStore.loading"
          data-testid="history-loading"
          class="rounded-2xl p-5 sm:p-6 text-center
                 bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
                 sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
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
          class="rounded-2xl p-6 sm:p-8 text-center
                 bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
                 sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
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
          class="relative ms-4 ps-8
                 border-s-2 border-dashed border-slate-200 dark:border-slate-700/60"
        >
          <li
            v-for="a in historyStore.items"
            :key="a.id"
            data-testid="history-item"
            :data-id="a.id"
            class="relative"
          >
            <span
              data-testid="history-item-severity"
              :data-severity="severityCategory(a)"
              class="absolute -start-10 top-5 z-10 h-3.5 w-3.5 rounded-full
                     ring-4 ring-white dark:ring-slate-950"
              :class="severityDotClass(a)"
              aria-hidden="true"
            ></span>

            <article
              class="p-4 mb-4
                     bg-white/60 dark:bg-slate-800/40 backdrop-blur-md
                     border border-slate-200/50 dark:border-white/10 rounded-2xl
                     shadow-[0_4px_20px_rgba(0,0,0,0.06)]
                     hover:scale-[1.02] transition-all duration-300"
            >
              <div class="flex items-center justify-between gap-3 mb-1">
                <time
                  :datetime="a.created_at"
                  :title="formatDate(a.created_at)"
                  class="text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  {{ timeAgo(a.created_at) }}
                </time>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="history-item-export"
                    @click="exportHistoryItem(a)"
                    :aria-label="t('symptom_form.report.download')"
                    :title="t('symptom_form.report.download')"
                    class="inline-flex items-center justify-center p-1.5 rounded-lg
                           bg-emerald-500/10 dark:bg-emerald-500/20
                           border border-emerald-500/30
                           text-emerald-600 dark:text-emerald-400
                           hover:bg-emerald-500/20 active:scale-95
                           transition-all duration-300 backdrop-blur-sm"
                  >
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <path d="M14 2v6h6"/>
                      <path d="M12 12v6"/>
                      <path d="m9 15 3 3 3-3"/>
                    </svg>
                  </button>
                  <span
                    data-testid="history-item-intensity"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    :class="intensityTone(a.intensity)"
                  >
                    {{ t('history.intensity_label') }}: {{ a.intensity }}/10
                  </span>
                </div>
              </div>

              <h2
                class="text-lg font-semibold text-slate-900 dark:text-slate-100"
                data-testid="history-item-symptom"
              >
                {{ localizedSymptom(a.primary_symptom) }}
              </h2>

              <p
                v-if="symptomSummary(a)"
                data-testid="history-item-summary"
                class="mt-0.5 text-sm text-slate-600 dark:text-slate-400 line-clamp-2"
              >
                {{ symptomSummary(a) }}
              </p>

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
