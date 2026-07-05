<script setup>
import { onMounted, ref, computed } from 'vue'
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

// ── Search & severity filtering ────────────────────────────────────────
const searchQuery = ref('')
const severityFilter = ref('all') // 'all' | 'acute' | 'stable'
const SEVERITY_CHIPS = [
  { key: 'all', labelKey: 'history.filter.all' },
  { key: 'acute', labelKey: 'history.filter.acute' },
  { key: 'stable', labelKey: 'history.filter.stable' }
]

function matchesSeverity(a) {
  if (severityFilter.value === 'all') return true
  const cat = severityCategory(a)
  // "acute" groups the elevated tiers (emergency + warning); "stable" is the rest.
  return severityFilter.value === 'acute'
    ? cat === 'emergency' || cat === 'warning'
    : cat === 'stable'
}

// Live-filtered timeline: severity chip + free-text over symptom, notes, body
// area and recommended specialty. The insights gauge above stays on the full
// history so the summary doesn't shift as you narrow the list.
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return historyStore.items.filter((a) => {
    if (!matchesSeverity(a)) return false
    if (!q) return true
    const hay = [
      localizedSymptom(a.primary_symptom),
      a.additional_info,
      a.body_area ? localizedBodyArea(a.body_area) : '',
      a.result?.specialty?.name
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
})

// Aggregate health insight for the dashboard gauge. Derives a 0–100 "wellness"
// score from the average reported severity (lower severity → higher score),
// a status tier, and a trend by comparing the newer half of entries against the
// older half. Items arrive newest-first (recent_first), so slice(0, mid) is the
// most recent window. Returns null when there's no usable severity data.
const healthInsights = computed(() => {
  const vals = historyStore.items
    .map((a) => Number(a.intensity))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!vals.length) return null

  const avg = vals.reduce((s, n) => s + n, 0) / vals.length
  const score = Math.round(((10 - avg) / 9) * 100) // avg 1→100, avg 10→0

  let statusKey, accent, glow
  if (avg <= 3.5) {
    statusKey = 'good'; accent = '#10b981'; glow = 'shadow-emerald-500/20'
  } else if (avg <= 6.5) {
    statusKey = 'moderate'; accent = '#f59e0b'; glow = 'shadow-amber-500/20'
  } else {
    statusKey = 'attention'; accent = '#f43f5e'; glow = 'shadow-rose-500/20'
  }

  let trend = 'single'
  if (vals.length >= 2) {
    const mid = Math.floor(vals.length / 2) || 1
    const newer = vals.slice(0, mid)
    const older = vals.slice(mid)
    const meanNewer = newer.reduce((s, n) => s + n, 0) / newer.length
    const meanOlder = older.reduce((s, n) => s + n, 0) / (older.length || 1)
    const delta = meanNewer - meanOlder // severity change, recent minus older
    if (delta <= -0.75) trend = 'down'      // severity falling → improving
    else if (delta >= 0.75) trend = 'up'    // severity rising → worsening
    else trend = 'stable'
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    statusKey,
    statusLabel: t(`history.insights.status_${statusKey}`),
    accent,
    glow,
    trend,
    insightText: t(`history.insights.trend_${trend}`)
  }
})

// Conic-gradient fill for the ring gauge: accent up to `score`, faint track after.
const gaugeStyle = computed(() => {
  const i = healthInsights.value
  if (!i) return {}
  return {
    background: `conic-gradient(${i.accent} ${i.score * 3.6}deg, rgba(148,163,184,0.20) ${i.score * 3.6}deg)`
  }
})

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

        <!-- Minimal Health Insights / Risk Gauge -->
        <div
          v-if="authStore.isAuthenticated && !historyStore.loading && !historyStore.error && healthInsights"
          data-testid="health-insights"
          class="p-5 bg-gradient-to-br from-white/80 to-white/40
                 dark:from-slate-800/60 dark:to-slate-800/20 backdrop-blur-xl
                 border border-slate-200/50 dark:border-white/10 rounded-3xl
                 shadow-[0_8px_30px_rgb(0,0,0,0.02)] mb-8
                 flex items-center justify-between gap-6 max-w-2xl mx-auto"
        >
          <!-- Visual gauge (start side / right in RTL) -->
          <div class="relative flex flex-col items-center gap-2 shrink-0">
            <div class="relative">
              <span
                aria-hidden="true"
                class="absolute inset-0 rounded-full blur-xl opacity-40 animate-pulse"
                :style="{ backgroundColor: healthInsights.accent }"
              ></span>
              <div
                class="relative h-20 w-20 rounded-full flex items-center justify-center shadow-lg"
                :class="healthInsights.glow"
                :style="gaugeStyle"
                role="img"
                :aria-label="`${t('history.insights.status_label')}: ${healthInsights.statusLabel}`"
              >
                <div
                  class="h-[58px] w-[58px] rounded-full bg-white dark:bg-slate-900
                         flex flex-col items-center justify-center leading-none"
                >
                  <span
                    data-testid="insights-score"
                    class="text-lg font-extrabold text-slate-800 dark:text-slate-100"
                  >{{ healthInsights.score }}</span>
                  <span class="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">/ 100</span>
                </div>
              </div>
            </div>
            <span
              data-testid="insights-status"
              class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
              :class="{
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': healthInsights.statusKey === 'good',
                'bg-amber-500/10 text-amber-600 dark:text-amber-400': healthInsights.statusKey === 'moderate',
                'bg-rose-500/10 text-rose-600 dark:text-rose-400': healthInsights.statusKey === 'attention'
              }"
            >
              {{ t('history.insights.status_label') }}: {{ healthInsights.statusLabel }}
            </span>
          </div>

          <!-- Smart trend typography (end side / left in RTL) -->
          <div class="flex-1 text-start">
            <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {{ t('history.insights.title') }}
            </p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {{ healthInsights.insightText }}
            </p>
          </div>
        </div>

        <!-- Minimalist History Search & Triage Filter Bar -->
        <div
          v-if="authStore.isAuthenticated && !historyStore.loading && !historyStore.error && historyStore.items.length"
          data-testid="history-filter-bar"
          class="flex flex-wrap items-center justify-between gap-3 mb-6 max-w-2xl mx-auto px-2"
        >
          <div class="relative w-full sm:w-64">
            <input
              v-model="searchQuery"
              type="text"
              data-testid="history-search"
              :placeholder="t('history.filter.search_placeholder')"
              :aria-label="t('history.filter.search_placeholder')"
              class="ps-3 pe-9 py-1.5 w-full bg-white/40 dark:bg-slate-800/20
                     border border-slate-200/40 dark:border-white/10 rounded-xl text-xs
                     text-slate-700 dark:text-slate-200 placeholder-slate-400
                     focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            <svg
              class="absolute end-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </div>

          <div class="flex items-center gap-1.5" data-testid="history-severity-filter">
            <button
              v-for="chip in SEVERITY_CHIPS"
              :key="chip.key"
              type="button"
              :data-testid="`filter-${chip.key}`"
              :aria-pressed="severityFilter === chip.key"
              @click="severityFilter = chip.key"
              :class="[
                'rounded-lg text-xs px-2.5 py-1 transition-all duration-200',
                severityFilter === chip.key
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-500/10'
              ]"
            >
              {{ t(chip.labelKey) }}
            </button>
          </div>
        </div>

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

        <div
          v-else-if="filteredItems.length === 0"
          data-testid="history-no-results"
          class="rounded-2xl p-6 sm:p-8 text-center
                 bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
                 sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
                 border border-white/60 dark:border-white/10
                 ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                 shadow-glass dark:shadow-glass-dk
                 text-slate-500 dark:text-slate-400"
        >
          {{ t('history.filter.no_results') }}
        </div>

        <ol
          v-else
          data-testid="history-timeline"
          class="relative ms-4 ps-8
                 border-s-2 border-dashed border-slate-200 dark:border-slate-700/60"
        >
          <li
            v-for="a in filteredItems"
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
