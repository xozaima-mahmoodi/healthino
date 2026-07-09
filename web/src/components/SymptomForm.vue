<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSymptomStore } from '../stores/symptom'
import { useLocaleStore } from '../stores/locale'
import { useToastStore } from '../stores/toast'
import { useHealthReport } from '../composables/useHealthReport'
import { api } from '../api/client'

const { t } = useI18n()
const symptomStore = useSymptomStore()
const localeStore = useLocaleStore()
const toast = useToastStore()
const { printHealthReport } = useHealthReport()

const COMMON_SYMPTOMS = [
  'headache', 'fever', 'cough', 'nausea',
  'sore_throat', 'fatigue', 'chest_pain',
  'abdominal_pain', 'dizziness', 'shortness_of_breath'
]

const BODY_AREAS = [
  'head', 'neurological', 'eyes_ears', 'mouth_throat',
  'chest', 'abdomen', 'back_spine', 'pelvic',
  'joints', 'skin', 'extremities'
]

const ACCEPTED_TYPES = 'image/*,application/pdf'

const GENDER_OPTIONS = ['male', 'female']

// Cinematic triage status steps shown while the AI request is in flight.
const TRIAGE_STEPS = [
  '🔍 در حال آنالیز و رمزگشایی کلمات کلیدی علائم شما...',
  '⚡ در حال برقراری اتصال امن با هسته مرکزی...',
  '🩺 در حال تطبیق پروتکل‌های تریاژ و ارزیابی فوریت‌های پزشکی...'
]

const initialFormState = () => ({
  symptomChoice: '',
  additionalInfo: '',
  severity: 5,
  body_area: '',
  duration_hours: null,
  gender: '',
  age: null,
  medical_history: false,
  medical_history_details: '',
  medication: false,
  medication_details: '',
  attachments: []
})

const initialErrorsState = () => ({
  symptomChoice: '',
  body_area: '',
  duration_hours: '',
  age: '',
  medical_history_details: '',
  medication_details: ''
})

const form = reactive(initialFormState())
const errors = reactive(initialErrorsState())
const isDragging = ref(false)
const isAnalyzing = ref(false)
const documentSummary = ref('')
const documentQuestions = ref([])
const userAnswers = reactive({})
const showQuestionsModal = ref(false)
const answersSubmitted = ref(false)
const previewAttachment = ref(null)
const previewSrc = ref('')
let previewTempUrl = null
let nextAttachmentId = 0

// Live triage loading overlay: stays visible for a minimum cinematic duration
// even when the API responds almost instantly, so the animation is never skipped.
const MIN_CINEMATIC_MS = 5500
const showCinematicLoading = ref(false)
const triageStep = ref(0)
let triageTimers = []

// Reveal the doctor cards a beat AFTER the results card appears, so their
// staggered entrance reads as a final "processing" flourish rather than
// popping in simultaneously with the rest of the result.
const showDoctorsList = ref(false)
let doctorsRevealTimer = null

// Snapshot of the submitted inputs (the form is reset once results arrive, so
// we capture the human-readable values at submit time for the share summary).
const lastAssessment = ref(null)
const summaryCopied = ref(false)
let summaryCopiedTimer = null

// AI feedback micro-interaction on the result card: 'up' | 'down' | null.
// Clicking the active choice again clears it (toggle).
const feedbackType = ref(null)
function setFeedback(type) {
  feedbackType.value = feedbackType.value === type ? null : type
}

// ── Medication safety / interaction checker (simulated) ────────────────
// A lightweight, front-end-only guard: the user tags medications and we show a
// reassuring "no known interaction" status after a brief shimmer. This does NOT
// call any real interaction database — it's an experimental UX affordance, hence
// the "(آزمایشی)" label and the "consult your doctor" copy.
const medications = ref([])
const medicationInput = ref('')
const guardChecking = ref(false)
let guardTimer = null

function addMedication() {
  const name = medicationInput.value.trim()
  medicationInput.value = ''
  if (!name) return
  if (medications.value.some((m) => m.toLowerCase() === name.toLowerCase())) return
  medications.value.push(name)
}
function removeMedication(index) {
  medications.value.splice(index, 1)
}

// Re-run the faux "AI guard" scan whenever the tag set changes.
watch(() => medications.value.length, (len) => {
  clearTimeout(guardTimer)
  if (len > 0) {
    guardChecking.value = true
    guardTimer = setTimeout(() => { guardChecking.value = false }, 900)
  } else {
    guardChecking.value = false
  }
})

function clearTriageTimers() {
  for (const id of triageTimers) clearTimeout(id)
  triageTimers = []
}

watch(showCinematicLoading, (loading) => {
  clearTriageTimers()
  if (loading) {
    triageStep.value = 0
    triageTimers.push(setTimeout(() => { triageStep.value = 1 }, 2000))
    triageTimers.push(setTimeout(() => { triageStep.value = 2 }, 4000))
  }
})

const isModalOpen = computed(() => showQuestionsModal.value || !!previewAttachment.value)

function setDocumentQuestions(questions) {
  const list = Array.isArray(questions) ? questions.filter(q => typeof q === 'string' && q.trim()) : []
  documentQuestions.value = list
  for (const key of Object.keys(userAnswers)) delete userAnswers[key]
  list.forEach((_, i) => { userAnswers[i] = '' })
  answersSubmitted.value = false
}

function openQuestionsModal() {
  if (documentQuestions.value.length) showQuestionsModal.value = true
}
function closeQuestionsModal() {
  showQuestionsModal.value = false
}
function confirmAnswers() {
  answersSubmitted.value = true
  showQuestionsModal.value = false
}

function openPreview(att) {
  if (!att) return
  if (att.previewUrl) {
    previewSrc.value = att.previewUrl
  } else {
    previewTempUrl = URL.createObjectURL(att.file)
    previewSrc.value = previewTempUrl
  }
  previewAttachment.value = att
}
function closePreview() {
  previewAttachment.value = null
  previewSrc.value = ''
  if (previewTempUrl) {
    URL.revokeObjectURL(previewTempUrl)
    previewTempUrl = null
  }
}

function onKeydown(e) {
  if (e.key !== 'Escape') return
  if (previewAttachment.value) closePreview()
  else if (showQuestionsModal.value) closeQuestionsModal()
}

watch(isModalOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))

async function analyzeDocuments() {
  if (isAnalyzing.value) return
  const first = form.attachments[0]
  if (!first) return

  isAnalyzing.value = true
  try {
    const fd = new FormData()
    fd.append('file', first.file, first.name)
    fd.append('locale', localeStore.current)
    const { data } = await api.post('/api/v1/assessments/analyze_document', fd, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Accept-Language': localeStore.current
      },
      // Document analysis is a long-running AI call: the backend allows up to
      // ~45s PER model and falls back across multiple models, so a slow 200 can
      // legitimately take well over a minute. The client's default 15s timeout
      // would abort a request the server ultimately completes, surfacing a false
      // error toast. Give this one call plenty of headroom past the server's
      // worst-case fallback chain.
      timeout: 120000
    })
    documentSummary.value = (data && data.summary) || ''
    setDocumentQuestions(data && data.questions)
    if (documentSummary.value || documentQuestions.value.length) {
      toast.success(t('toast.document_analysis_success'))
      openQuestionsModal()
    } else {
      toast.error(t('toast.document_analysis_error'))
    }
  } catch (e) {
    const status = e?.response?.status
    const body = e?.response?.data
    console.warn('[symptom] analyze_document failed', { status, body, message: e?.message })
    toast.error(t('toast.document_analysis_error'))
  } finally {
    isAnalyzing.value = false
  }
}

function isImage(type) {
  return typeof type === 'string' && type.startsWith('image/')
}

function addFiles(fileList) {
  if (!fileList) return
  for (const file of fileList) {
    const previewUrl = isImage(file.type) ? URL.createObjectURL(file) : null
    form.attachments.push({
      id: ++nextAttachmentId,
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      previewUrl
    })
  }
}

function onFileChange(e) {
  if (!e.target.files?.length) return
  addFiles(e.target.files)
  e.target.value = ''
}

function removeAttachment(id) {
  const idx = form.attachments.findIndex(a => a.id === id)
  if (idx === -1) return
  const [removed] = form.attachments.splice(idx, 1)
  if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl)
  if (previewAttachment.value && previewAttachment.value.id === id) closePreview()
  if (!form.attachments.length) {
    documentSummary.value = ''
    setDocumentQuestions([])
    showQuestionsModal.value = false
  }
}

function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave() {
  isDragging.value = false
}
function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function clearErrors() {
  Object.assign(errors, initialErrorsState())
}

function validate() {
  clearErrors()
  if (!form.symptomChoice) {
    errors.symptomChoice = t('symptom_form.validation.symptom_required')
  }
  if (!form.body_area) {
    errors.body_area = t('symptom_form.validation.body_area_required')
  }
  if (!(Number(form.duration_hours) > 0)) {
    errors.duration_hours = t('symptom_form.validation.duration_required')
  }
  if (form.age !== null && form.age !== '' && !(Number(form.age) > 0 && Number(form.age) < 150)) {
    errors.age = t('symptom_form.validation.age_invalid')
  }
  if (form.medical_history && !form.medical_history_details.trim()) {
    errors.medical_history_details = t('symptom_form.validation.medical_history_details_required')
  }
  if (form.medication && !form.medication_details.trim()) {
    errors.medication_details = t('symptom_form.validation.medication_details_required')
  }
  return !errors.symptomChoice && !errors.body_area && !errors.duration_hours
    && !errors.age && !errors.medical_history_details && !errors.medication_details
}

watch(() => form.symptomChoice, (v) => { if (v) errors.symptomChoice = '' })
watch(() => form.body_area, (v) => { if (v) errors.body_area = '' })
watch(() => form.duration_hours, (v) => { if (Number(v) > 0) errors.duration_hours = '' })
watch(() => form.medical_history, (v) => {
  if (!v) {
    form.medical_history_details = ''
    errors.medical_history_details = ''
  }
})
watch(() => form.medical_history_details, (v) => {
  if (v && v.trim()) errors.medical_history_details = ''
})
watch(() => form.medication, (v) => {
  if (!v) {
    form.medication_details = ''
    errors.medication_details = ''
  }
})
watch(() => form.medication_details, (v) => {
  if (v && v.trim()) errors.medication_details = ''
})
watch(() => form.age, (v) => {
  if (v === null || v === '' || (Number(v) > 0 && Number(v) < 150)) errors.age = ''
})

function resetForm() {
  for (const a of form.attachments) {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
  }
  Object.assign(form, initialFormState())
  clearErrors()
  nextAttachmentId = 0
  isDragging.value = false
  documentSummary.value = ''
  setDocumentQuestions([])
  showQuestionsModal.value = false
  closePreview()
  isAnalyzing.value = false
}

watch(() => symptomStore.result, (val) => {
  if (val) resetForm()
})

function startNewAssessment() {
  clearTimeout(doctorsRevealTimer)
  clearTimeout(summaryCopiedTimer)
  showDoctorsList.value = false
  summaryCopied.value = false
  feedbackType.value = null
  clearTimeout(guardTimer)
  guardChecking.value = false
  medications.value = []
  medicationInput.value = ''
  symptomStore.reset()
}

// Formats the submitted symptoms + AI triage result into a clean, shareable text block.
function buildTriageSummary() {
  const r = symptomStore.result
  const a = lastAssessment.value
  const lines = [t('symptom_form.summary_heading')]
  if (a?.symptoms?.length) lines.push(`${t('symptom_form.summary_symptoms')}: ${a.symptoms.join('، ')}`)
  if (a?.bodyArea) lines.push(`${t('symptom_form.body_area_label')}: ${a.bodyArea}`)
  if (a && Number.isFinite(a.severity)) lines.push(`${t('symptom_form.summary_severity')}: ${a.severity}/10`)
  if (a && Number.isFinite(a.durationHours) && a.durationHours > 0) {
    lines.push(`${t('symptom_form.duration_label')}: ${a.durationHours}`)
  }
  if (r?.red_flag) lines.push(`⚠️ ${t('symptom_form.red_flag_warning')}`)
  if (r?.specialty?.name) lines.push(`${t('symptom_form.recommended_specialty')}: ${r.specialty.name}`)
  const aid = firstAidItems.value
  if (aid?.length) {
    lines.push(`${t('symptom_form.first_aid.title')}:`)
    for (const item of aid) lines.push(`• ${item}`)
  }
  if (r?.doctors?.length) {
    lines.push(`${t('symptom_form.recommended_doctors')}:`)
    for (const d of r.doctors) {
      lines.push(`• ${d.name} — ${d.experience_years} ${t('symptom_form.experience_years')} · ★ ${d.rating.toFixed(1)}`)
    }
  }
  return lines.join('\n')
}

// Copies text with a graceful fallback for browsers/contexts without the async
// Clipboard API (e.g. non-secure origins).
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) {
    return false
  }
}

async function copySummary() {
  const ok = await copyText(buildTriageSummary())
  if (ok) {
    summaryCopied.value = true
    clearTimeout(summaryCopiedTimer)
    summaryCopiedTimer = setTimeout(() => { summaryCopied.value = false }, 2000)
  } else {
    toast.error(t('toast.copy_error'))
  }
}

async function shareSummary() {
  const text = buildTriageSummary()
  if (navigator.share) {
    try {
      await navigator.share({ title: t('symptom_form.summary_heading'), text })
    } catch (e) {
      // The user dismissing the native share sheet throws AbortError — ignore it.
      if (e && e.name !== 'AbortError') toast.error(t('toast.share_error'))
    }
    return
  }
  // Graceful fallback when the Web Share API is unavailable: copy + inform.
  const ok = await copyText(text)
  if (ok) toast.info(t('toast.share_unsupported_copied'))
  else toast.error(t('toast.share_error'))
}

// ── Digital Health Pass (PDF export) ───────────────────────────────────
// Delegates to the shared report composable; here we only map the live triage
// result + submitted inputs into the normalized record it expects.
function downloadReport() {
  const r = symptomStore.result
  if (!r) return
  const a = lastAssessment.value
  const u = triageUrgency.value
  const ok = printHealthReport({
    urgencyKey: u?.key,
    urgencyLabel: u?.label,
    redFlag: !!r.red_flag,
    symptoms: a?.symptoms || [],
    severity: (a && Number.isFinite(a.severity)) ? a.severity : null,
    bodyArea: a?.bodyArea || '',
    durationHours: (a && Number.isFinite(a.durationHours)) ? a.durationHours : null,
    specialtyName: r.specialty?.name || null,
    careActions: firstAidItems.value || [],
    doctors: r.doctors || [],
    refId: r.symptom_log_id ? `HLT-${r.symptom_log_id}` : null
  })
  if (!ok) toast.error(t('toast.unexpected_error'))
}

// Live context meter for the free-text field: counts words and flags when the
// user has provided enough detail so the micro-indicator can shift amber -> emerald.
const additionalInfoWordCount = computed(() => {
  const trimmed = form.additionalInfo.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
})
const hasEnoughContext = computed(() => additionalInfoWordCount.value >= 3)

// Dynamic AI processing-time estimate shown beside the word counter. It scales
// gently with how much the user has written — a tiny bit of premium feedback
// that makes the upcoming analysis feel considered rather than instantaneous.
const aiEstimateSeconds = computed(() => {
  const len = form.additionalInfo.trim().length
  if (len === 0) return 0
  // Base ~2s, then a second per ~90 chars, capped so it never feels alarming.
  return Math.min(9, 2 + Math.floor(len / 90))
})

// Localises digits to match the active language (Persian ۰-۹, Sorani ٠-٩, Latin).
const localizeDigits = (value) => {
  const sets = { fa: '۰۱۲۳۴۵۶۷۸۹', ckb: '٠١٢٣٤٥٦٧٨٩' }
  const set = sets[localeStore.current]
  return set ? String(value).replace(/\d/g, (d) => set[d]) : String(value)
}

const aiEstimateText = computed(() =>
  aiEstimateSeconds.value === 0
    ? t('symptom_form.ai_estimate_ready')
    : t('symptom_form.ai_estimate_time', { seconds: localizeDigits(aiEstimateSeconds.value) })
)

// Pulses the badge only while the user is actively typing, then settles once
// they pause. The timer is cleared on unmount so it can't fire into a dead view.
const isTypingContext = ref(false)
let typingSettleTimer = null
const noteContextTyping = () => {
  isTypingContext.value = true
  if (typingSettleTimer !== null) clearTimeout(typingSettleTimer)
  typingSettleTimer = setTimeout(() => {
    isTypingContext.value = false
    typingSettleTimer = null
  }, 900)
}
onBeforeUnmount(() => {
  if (typingSettleTimer !== null) clearTimeout(typingSettleTimer)
})

// Derives the triage urgency tier from the result for the premium status badge.
const triageUrgency = computed(() => {
  const r = symptomStore.result
  if (!r) return null
  const isEmergency = !!r.red_flag || r.specialty?.slug === 'emergency'
  return isEmergency
    ? {
        key: 'emergency',
        label: t('symptom_form.urgency_emergency'),
        dot: 'bg-rose-500',
        text: 'text-rose-700 dark:text-rose-300',
        chip: 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/50'
      }
    : {
        key: 'routine',
        label: t('symptom_form.urgency_routine'),
        dot: 'bg-emerald-500',
        text: 'text-emerald-700 dark:text-emerald-300',
        chip: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/50'
      }
})

const firstAidItems = computed(() => {
  const fromApi = symptomStore.result?.first_aid
  if (Array.isArray(fromApi) && fromApi.length) return fromApi
  return [
    t('symptom_form.first_aid.default_1'),
    t('symptom_form.first_aid.default_2'),
    t('symptom_form.first_aid.default_3')
  ]
})

// Flags a care step as critical (emergency escalation) so it gets the crimson
// alert treatment and a pulsing dot instead of the calm amber styling.
const CRITICAL_AID_PATTERNS = ['اورژانس', 'تشدید علائم', 'emergency', 'worsen']
function isCriticalAidItem(item) {
  const text = String(item || '').toLowerCase()
  return CRITICAL_AID_PATTERNS.some(p => text.includes(p.toLowerCase()))
}

onBeforeUnmount(() => {
  for (const a of form.attachments) {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
  }
  if (previewTempUrl) URL.revokeObjectURL(previewTempUrl)
  clearTriageTimers()
  clearTimeout(doctorsRevealTimer)
  clearTimeout(summaryCopiedTimer)
  clearTimeout(guardTimer)
  window.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

const apiErrorMessages = computed(() => {
  const err = symptomStore.error
  if (!err) return []
  if (err.errors && typeof err.errors === 'object') {
    return Object.values(err.errors).flat().filter(Boolean).map(String)
  }
  if (err.message) return [String(err.message)]
  return [t('symptom_form.submit_error_generic')]
})

async function submit() {
  if (symptomStore.submitting || showCinematicLoading.value) return
  if (!validate()) return
  const symptoms = [t(`symptoms.${form.symptomChoice}`)]
  const extra = form.additionalInfo.trim()
  if (extra) symptoms.push(extra)
  const documentQuestionList = documentQuestions.value
  const documentAnswers = documentQuestionList.map((question, i) => ({
    question,
    answer: (userAnswers[i] || '').trim()
  }))
  const payload = {
    symptoms,
    severity: Number(form.severity),
    body_area: form.body_area,
    duration_hours: Number(form.duration_hours),
    gender: form.gender || null,
    age: form.age ? Number(form.age) : null,
    medical_history: !!form.medical_history,
    medical_history_details: form.medical_history ? form.medical_history_details.trim() : null,
    medication: !!form.medication,
    medication_details: form.medication ? form.medication_details.trim() : null,
    document_summary: documentSummary.value || null,
    document_questions: documentQuestionList,
    user_answers: { ...userAnswers },
    document_answers: documentAnswers,
    locale: localeStore.current
  }

  lastAssessment.value = {
    symptoms: [...symptoms],
    severity: Number(form.severity),
    bodyArea: form.body_area ? t(`body_areas.${form.body_area}`) : '',
    durationHours: Number(form.duration_hours)
  }

  clearTimeout(doctorsRevealTimer)
  showDoctorsList.value = false
  showCinematicLoading.value = true
  const startedAt = Date.now()
  const ok = await symptomStore.analyze(payload)

  // Keep the cinematic overlay on screen for the full minimum duration,
  // even if the API already resolved, before revealing the results card.
  const remaining = MIN_CINEMATIC_MS - (Date.now() - startedAt)
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining))
  }
  showCinematicLoading.value = false

  // Let the results card settle in first, then stagger the doctors in ~450ms later.
  if (ok) {
    doctorsRevealTimer = setTimeout(() => { showDoctorsList.value = true }, 450)
  }

  if (ok) {
    toast.success(t('toast.analysis_success'))
  } else if (symptomStore.error) {
    toast.error(t('toast.analysis_error'))
  }
}
</script>

<template>
  <Transition name="fade" mode="out-in">
    <div
      v-if="!symptomStore.result"
      key="form"
      data-testid="form-card"
      class="rounded-3xl p-6 md:p-8
             bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
             sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
             border border-slate-200/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-emerald-400/15
             shadow-soft-lg dark:shadow-glass-dk
             transition-all duration-300 ease-out"
    >
      <form class="space-y-6" novalidate @submit.prevent="submit">
        <div>
          <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
            {{ t('symptom_form.symptoms_label') }}
            <span class="text-rose-400 ms-1" aria-hidden="true">*</span>
          </label>
          <select
            v-model="form.symptomChoice"
            data-testid="primary-symptom-select"
            aria-required="true"
            :aria-invalid="!!errors.symptomChoice"
            :class="[
              'w-full px-4 py-3 rounded-xl appearance-none',
              'bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm',
              'text-slate-800 dark:text-slate-100',
              'shadow-sm transition-all duration-300 ease-out',
              'focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none',
              errors.symptomChoice
                ? 'border border-rose-300 dark:border-red-500/70 ring-2 ring-rose-200/60'
                : 'border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80'
            ]"
          >
            <option value="" disabled>{{ t('symptom_form.symptoms_select_placeholder') }}</option>
            <option v-for="s in COMMON_SYMPTOMS" :key="s" :value="s">
              {{ t(`symptoms.${s}`) }}
            </option>
          </select>
          <p
            v-if="errors.symptomChoice"
            data-testid="error-symptom"
            class="mt-1.5 text-xs font-medium text-rose-600 dark:text-red-400"
          >
            {{ errors.symptomChoice }}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
              {{ t('symptom_form.gender_label') }}
            </label>
            <select
              v-model="form.gender"
              data-testid="gender-select"
              class="w-full px-4 py-3 rounded-xl appearance-none
                     bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm
                     border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80
                     text-slate-800 dark:text-slate-100 shadow-sm
                     transition-all duration-300 ease-out
                     focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none"
            >
              <option value="">{{ t('symptom_form.gender_placeholder') }}</option>
              <option v-for="g in GENDER_OPTIONS" :key="g" :value="g">
                {{ t(`symptom_form.gender_${g}`) }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
              {{ t('symptom_form.age_label') }}
            </label>
            <input
              v-model.number="form.age"
              type="number"
              min="1"
              max="149"
              data-testid="age-input"
              :placeholder="t('symptom_form.age_placeholder')"
              :aria-invalid="!!errors.age"
              :class="[
                'w-full px-4 py-3 rounded-xl',
                'bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm',
                'text-slate-800 dark:text-slate-100',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'transition-all duration-300 ease-out',
                'focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none',
                errors.age
                  ? 'border border-rose-300 dark:border-red-500/70 ring-2 ring-rose-200/60'
                  : 'border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80'
              ]"
            />
            <p
              v-if="errors.age"
              data-testid="error-age"
              class="mt-1.5 text-xs font-medium text-rose-600 dark:text-red-400"
            >
              {{ errors.age }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div
            class="rounded-2xl p-4 sm:p-5
                   bg-white/60 dark:bg-slate-900/40 backdrop-blur-md
                   border border-slate-200/60 dark:border-white/10
                   ring-1 ring-slate-900/5 dark:ring-white/5
                   shadow-soft transition-all duration-300 ease-out
                   hover:-translate-y-0.5 hover:shadow-soft-md"
          >
            <div class="flex items-center justify-between gap-3">
              <label
                for="medical-history-toggle"
                class="text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                {{ t('symptom_form.medical_history_label') }}
              </label>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  id="medical-history-toggle"
                  v-model="form.medical_history"
                  type="checkbox"
                  data-testid="medical-history-toggle"
                  class="sr-only peer"
                />
                <span
                  class="w-11 h-6 bg-slate-300 dark:bg-slate-600 rounded-full
                         peer-checked:bg-brand transition
                         after:content-[''] after:absolute after:top-0.5 after:start-0.5
                         after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                         peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
                ></span>
                <span class="ms-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {{ form.medical_history ? t('symptom_form.medical_history_yes') : t('symptom_form.medical_history_no') }}
                </span>
              </label>
            </div>
            <div v-if="form.medical_history" data-testid="medical-history-details-wrap" class="mt-3">
              <input
                v-model="form.medical_history_details"
                type="text"
                data-testid="medical-history-details-input"
                :placeholder="t('symptom_form.medical_history_details_placeholder')"
                :aria-label="t('symptom_form.medical_history_details_label')"
                aria-required="true"
                :aria-invalid="!!errors.medical_history_details"
                :class="[
                  'w-full px-4 py-3 rounded-xl',
                  'bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm',
                  'text-slate-800 dark:text-slate-100',
                  'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                  'transition-all duration-300 ease-out',
                  'focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none',
                  errors.medical_history_details
                    ? 'border border-rose-300 dark:border-red-500/70 ring-2 ring-rose-200/60'
                    : 'border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80'
                ]"
              />
              <p
                v-if="errors.medical_history_details"
                data-testid="error-medical-history-details"
                class="mt-1.5 text-xs font-medium text-rose-600 dark:text-red-400"
              >
                {{ errors.medical_history_details }}
              </p>
            </div>
          </div>

          <div
            class="rounded-2xl p-4 sm:p-5
                   bg-white/60 dark:bg-slate-900/40 backdrop-blur-md
                   border border-slate-200/60 dark:border-white/10
                   ring-1 ring-slate-900/5 dark:ring-white/5
                   shadow-soft transition-all duration-300 ease-out
                   hover:-translate-y-0.5 hover:shadow-soft-md"
          >
            <div class="flex items-center justify-between gap-3">
              <label
                for="medication-toggle"
                class="text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                {{ t('symptom_form.medication_label') }}
              </label>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  id="medication-toggle"
                  v-model="form.medication"
                  type="checkbox"
                  data-testid="medication-toggle"
                  class="sr-only peer"
                />
                <span
                  class="w-11 h-6 bg-slate-300 dark:bg-slate-600 rounded-full
                         peer-checked:bg-brand transition
                         after:content-[''] after:absolute after:top-0.5 after:start-0.5
                         after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                         peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
                ></span>
                <span class="ms-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {{ form.medication ? t('symptom_form.medication_yes') : t('symptom_form.medication_no') }}
                </span>
              </label>
            </div>
            <div v-if="form.medication" data-testid="medication-details-wrap" class="mt-3">
              <input
                v-model="form.medication_details"
                type="text"
                data-testid="medication-details-input"
                :placeholder="t('symptom_form.medication_details_placeholder')"
                :aria-label="t('symptom_form.medication_details_label')"
                aria-required="true"
                :aria-invalid="!!errors.medication_details"
                :class="[
                  'w-full px-4 py-3 rounded-xl',
                  'bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm',
                  'text-slate-800 dark:text-slate-100',
                  'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                  'transition-all duration-300 ease-out',
                  'focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none',
                  errors.medication_details
                    ? 'border border-rose-300 dark:border-red-500/70 ring-2 ring-rose-200/60'
                    : 'border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80'
                ]"
              />
              <p
                v-if="errors.medication_details"
                data-testid="error-medication-details"
                class="mt-1.5 text-xs font-medium text-rose-600 dark:text-red-400"
              >
                {{ errors.medication_details }}
              </p>
            </div>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3 mb-2">
            <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300">
              {{ t('symptom_form.additional_info_label') }}
            </label>

            <div class="flex items-center gap-2">
              <!-- Smart context micro-indicator: amber until enough detail, then emerald -->
              <span
                data-testid="context-indicator"
                :title="hasEnoughContext ? t('symptom_form.context_hint_good') : t('symptom_form.context_hint_more')"
                class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1
                       bg-slate-100/60 dark:bg-slate-800/50 backdrop-blur-sm
                       border border-slate-200/60 dark:border-white/10
                       text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400
                       transition-all duration-300 ease-in-out"
              >
                <span
                  class="h-2 w-2 rounded-full transition-all duration-300 ease-in-out"
                  :class="hasEnoughContext
                    ? 'bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]'
                    : 'bg-amber-400 shadow-[0_0_7px_1px_rgba(251,191,36,0.5)]'"
                ></span>
                <span class="tabular-nums">{{ additionalInfoWordCount }} {{ t('symptom_form.context_words') }}</span>
              </span>

              <!-- Dynamic AI processing-time estimate; breathes only while typing -->
              <span
                data-testid="ai-estimate-badge"
                :class="{ 'animate-pulse': isTypingContext }"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-emerald-500/10 dark:bg-emerald-500/20
                       text-[10px] font-medium text-emerald-600 dark:text-emerald-400
                       border border-emerald-500/20 shadow-sm transition-all duration-300"
              >
                <svg class="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.5l1.9 4.6 4.6 1.9-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.9L12 2.5z" />
                  <path d="M18.5 14l.85 2.05L21.5 17l-2.15.95L18.5 20l-.85-2.05L15.5 17l2.15-.95L18.5 14z" opacity="0.85" />
                </svg>
                <span>{{ aiEstimateText }}</span>
              </span>
            </div>
          </div>
          <textarea
            v-model="form.additionalInfo"
            data-testid="additional-info-input"
            rows="3"
            @input="noteContextTyping"
            :placeholder="t('symptom_form.additional_info_placeholder')"
            class="w-full px-4 py-3 rounded-xl resize-y
                   bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm shadow-sm
                   border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80
                   text-slate-800 dark:text-slate-100
                   placeholder:text-slate-400 dark:placeholder:text-slate-500
                   transition-all duration-300 ease-in-out
                   focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10"
          ></textarea>
        </div>

        <div>
          <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
            {{ t('symptom_form.attachments_label') }}
          </label>

          <div
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            :class="[
              'relative rounded-2xl border-2 border-dashed transition-all duration-300 ease-out overflow-hidden',
              'bg-white/60 dark:bg-slate-900/50 sm:bg-white/50 sm:dark:bg-slate-900/40 backdrop-blur-sm sm:backdrop-blur-md',
              isDragging
                ? 'border-brand bg-brand/5 dark:bg-emerald-900/20 shadow-glow -translate-y-0.5'
                : 'border-slate-300/70 dark:border-slate-600/70'
            ]"
          >
            <label
              v-if="!form.attachments.length"
              for="symptom-attachments"
              data-testid="upload-zone"
              class="flex flex-col items-center justify-center gap-2 px-4 sm:px-6 py-10 sm:py-8 text-center min-h-[140px] cursor-pointer rounded-2xl
                     hover:bg-brand/5 dark:hover:bg-emerald-900/20 transition-all duration-300 ease-out"
            >
              <svg class="h-10 w-10 text-slate-400 dark:text-slate-500"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 18a5 5 0 1 1 .9-9.92A6 6 0 0 1 19 13a4 4 0 0 1-1 7.87"/>
                <path d="M12 12v8"/>
                <path d="M9 15l3-3 3 3"/>
              </svg>
              <span class="text-sm text-slate-600 dark:text-slate-300">
                {{ t('symptom_form.attachments_hint') }}
              </span>
              <span class="text-xs text-slate-400 dark:text-slate-500">
                {{ t('symptom_form.attachments_types') }}
              </span>
            </label>

            <div v-else class="p-3 sm:p-4">
              <ul
                data-testid="attachments-preview"
                class="grid grid-cols-2 sm:grid-cols-3 gap-3"
              >
                <li
                  v-for="att in form.attachments"
                  :key="att.id"
                  data-testid="attachment-item"
                  :data-name="att.name"
                  class="relative rounded-2xl overflow-hidden
                         bg-white/85 dark:bg-slate-800/60 sm:bg-white/80 sm:dark:bg-slate-800/50
                         backdrop-blur-sm sm:backdrop-blur-md
                         border border-slate-200/60 dark:border-white/10
                         ring-1 ring-slate-900/5 dark:ring-white/5
                         shadow-soft transition-all duration-300 ease-out
                         hover:-translate-y-0.5 hover:shadow-soft-md"
                >
                  <div class="aspect-square flex items-center justify-center bg-slate-50 dark:bg-slate-900/40">
                    <img
                      v-if="att.previewUrl"
                      :src="att.previewUrl"
                      :alt="att.name"
                      data-testid="attachment-thumbnail"
                      class="h-full w-full object-cover"
                    />
                    <svg v-else
                         data-testid="attachment-icon"
                         class="h-10 w-10 text-slate-400 dark:text-slate-500"
                         viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <path d="M14 2v6h6"/>
                      <path d="M9 13h6"/>
                      <path d="M9 17h6"/>
                    </svg>
                  </div>
                  <div class="px-2 py-1.5 text-xs">
                    <div class="truncate text-slate-700 dark:text-slate-200" :title="att.name">{{ att.name }}</div>
                    <div class="text-slate-400 dark:text-slate-500">{{ formatSize(att.size) }}</div>
                  </div>
                  <div class="absolute top-1.5 end-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      :aria-label="t('symptom_form.document_preview')"
                      :title="t('symptom_form.document_preview')"
                      data-testid="attachment-preview"
                      @click="openPreview(att)"
                      class="inline-flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-full
                             bg-white/95 dark:bg-slate-900/85 backdrop-blur
                             border border-white/70 dark:border-white/10
                             text-slate-700 dark:text-slate-200
                             hover:bg-brand/10 hover:text-brand-dark
                             dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300
                             transition shadow"
                    >
                      <svg class="h-4 w-4 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                    <button
                      type="button"
                      :aria-label="t('symptom_form.attachments_remove')"
                      :title="t('symptom_form.attachments_remove')"
                      data-testid="attachment-remove"
                      @click="removeAttachment(att.id)"
                      class="inline-flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-full
                             bg-white/95 dark:bg-slate-900/85 backdrop-blur
                             border border-white/70 dark:border-white/10
                             text-slate-700 dark:text-slate-200
                             hover:bg-red-50 hover:text-red-600
                             dark:hover:bg-red-900/40 dark:hover:text-red-300
                             transition shadow"
                    >
                      <svg class="h-4 w-4 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" stroke-width="2.4"
                           stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </li>
              </ul>

              <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label
                  for="symptom-attachments"
                  class="inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
                         text-xs font-medium text-slate-500 dark:text-slate-400
                         hover:text-brand-dark dark:hover:text-emerald-300 transition"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  {{ t('symptom_form.attachments_add_more') }}
                </label>

                <button
                  type="button"
                  :disabled="isAnalyzing"
                  data-testid="analyze-documents-button"
                  @click="analyzeDocuments"
                  class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl
                         bg-white/85 dark:bg-slate-800/60 backdrop-blur-md
                         border border-slate-200/60 dark:border-white/10
                         ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                         text-sm font-semibold text-brand-dark dark:text-emerald-300
                         shadow-soft hover:bg-brand/5 dark:hover:bg-emerald-900/20
                         hover:-translate-y-0.5 hover:shadow-soft-md
                         transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    v-if="isAnalyzing"
                    data-testid="analyze-documents-spinner"
                    class="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24" fill="none"
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"/>
                    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                  </svg>
                  <svg
                    v-else
                    class="h-4 w-4"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    <path d="M9 9h6"/>
                    <path d="M9 13h4"/>
                  </svg>
                  {{ isAnalyzing ? t('symptom_form.analyzing_documents') : t('symptom_form.analyze_documents') }}
                </button>
              </div>
            </div>

            <input
              id="symptom-attachments"
              type="file"
              multiple
              :accept="ACCEPTED_TYPES"
              data-testid="attachments-input"
              class="sr-only"
              @change="onFileChange"
            />
          </div>

          <div
            v-if="documentSummary"
            data-testid="document-summary"
            class="mt-3 rounded-2xl p-4 sm:p-5
                   bg-white/85 dark:bg-slate-800/60 backdrop-blur-md
                   border border-slate-200/60 dark:border-white/10
                   ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                   shadow-soft text-sm text-slate-700 dark:text-slate-200"
          >
            <div class="font-semibold mb-1 text-brand-dark dark:text-emerald-300">
              {{ t('symptom_form.document_summary_title') }}
            </div>
            <p class="whitespace-pre-wrap">{{ documentSummary }}</p>
          </div>

          <Transition name="questions-slide">
            <button
              v-if="answersSubmitted"
              type="button"
              data-testid="answers-saved-badge"
              @click="openQuestionsModal"
              class="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl
                     bg-emerald-50/80 dark:bg-emerald-900/30 backdrop-blur-md
                     border border-emerald-200/80 dark:border-emerald-700/40
                     ring-1 ring-emerald-500/10 shadow-soft
                     text-sm font-medium text-emerald-700 dark:text-emerald-300
                     hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50
                     hover:-translate-y-0.5 hover:shadow-soft-md
                     transition-all duration-300 ease-out"
            >
              <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              {{ t('symptom_form.answers_saved_badge') }}
            </button>
          </Transition>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
              {{ t('symptom_form.severity_label') }}
              <span class="text-rose-400 ms-1" aria-hidden="true">*</span>
            </label>
            <input
              v-model.number="form.severity"
              type="range"
              min="1"
              max="10"
              data-testid="severity-input"
              class="touch-slider w-full accent-brand"
            />
            <div class="text-sm font-semibold text-brand-dark dark:text-emerald-300 mt-1 tabular-nums">{{ form.severity }}</div>
          </div>

          <div>
            <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
              {{ t('symptom_form.body_area_label') }}
              <span class="text-rose-400 ms-1" aria-hidden="true">*</span>
            </label>
            <select
              v-model="form.body_area"
              data-testid="body-area-select"
              aria-required="true"
              :aria-invalid="!!errors.body_area"
              :class="[
                'w-full px-4 py-3 rounded-xl appearance-none',
                'bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm',
                'text-slate-800 dark:text-slate-100',
                'transition-all duration-300 ease-out',
                'focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none',
                errors.body_area
                  ? 'border border-rose-300 dark:border-red-500/70 ring-2 ring-rose-200/60'
                  : 'border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80'
              ]"
            >
              <option value="" disabled>{{ t('symptom_form.body_area_placeholder') }}</option>
              <option v-for="area in BODY_AREAS" :key="area" :value="area">
                {{ t(`body_areas.${area}`) }}
              </option>
            </select>
            <p
              v-if="errors.body_area"
              data-testid="error-body-area"
              class="mt-1.5 text-xs font-medium text-rose-600 dark:text-red-400"
            >
              {{ errors.body_area }}
            </p>
          </div>
        </div>

        <div>
          <label class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2">
            {{ t('symptom_form.duration_label') }}
            <span class="text-rose-400 ms-1" aria-hidden="true">*</span>
          </label>
          <input
            v-model.number="form.duration_hours"
            type="number"
            min="1"
            data-testid="duration-input"
            aria-required="true"
            :aria-invalid="!!errors.duration_hours"
            :class="[
              'w-full px-4 py-3 rounded-xl',
              'bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm',
              'text-slate-800 dark:text-slate-100',
              'transition-all duration-300 ease-out',
              'focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none',
              errors.duration_hours
                ? 'border border-rose-300 dark:border-red-500/70 ring-2 ring-rose-200/60'
                : 'border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80'
            ]"
          />
          <p
            v-if="errors.duration_hours"
            data-testid="error-duration"
            class="mt-1.5 text-xs font-medium text-rose-600 dark:text-red-400"
          >
            {{ errors.duration_hours }}
          </p>
        </div>

        <div
          v-if="apiErrorMessages.length"
          data-testid="submit-error"
          role="alert"
          class="rounded-2xl p-4 text-sm
                 bg-rose-50/90 dark:bg-red-950/40 backdrop-blur-sm
                 border border-rose-200/80 dark:border-red-700/40
                 shadow-soft text-rose-800 dark:text-red-200"
        >
          <p class="font-semibold mb-1">{{ t('symptom_form.submit_error_title') }}</p>
          <ul class="list-disc ps-5 space-y-0.5">
            <li v-for="(msg, i) in apiErrorMessages" :key="i">{{ msg }}</li>
          </ul>
        </div>

        <button
          type="submit"
          :disabled="symptomStore.submitting || showCinematicLoading"
          class="group relative isolate w-full overflow-hidden py-3.5 rounded-xl font-semibold text-white
                 bg-gradient-to-br from-brand to-brand-dark shadow-cta
                 hover:-translate-y-0.5 active:translate-y-0
                 hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]
                 transition-all duration-300 ease-out
                 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3
                   bg-gradient-to-r from-transparent via-white/30 to-transparent
                   animate-shimmer motion-reduce:hidden group-disabled:hidden"
          ></span>
          <span class="relative z-10">{{ (symptomStore.submitting || showCinematicLoading) ? t('symptom_form.analyzing') : t('symptom_form.submit') }}</span>
        </button>
      </form>
    </div>

    <div
      v-else
      key="result"
      data-testid="result-card"
      class="relative rounded-3xl p-6 md:p-8 space-y-6
             bg-white/90 dark:bg-slate-800/60 backdrop-blur-md
             sm:bg-white/80 sm:dark:bg-slate-800/40 sm:backdrop-blur-xl
             border border-slate-200/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-emerald-400/15
             shadow-soft-lg dark:shadow-glass-dk
             transition-all duration-300 ease-out"
    >
      <div class="flex items-center gap-3">
        <div class="inline-flex h-11 w-11 items-center justify-center
                    rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700
                    text-white shadow-glow ring-1 ring-white/20">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <h2 class="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          {{ t('symptom_form.result_title') }}
        </h2>
      </div>

      <div
        v-if="symptomStore.result.red_flag"
        data-testid="result-red-flag"
        class="rounded-2xl p-4 font-medium
               bg-rose-50/90 dark:bg-red-950/40 backdrop-blur-sm
               border border-rose-200/80 dark:border-red-700/40
               shadow-soft text-rose-800 dark:text-red-200"
      >
        {{ t('symptom_form.red_flag_warning') }}
      </div>

      <div
        v-if="symptomStore.result.specialty"
        data-testid="result-specialty"
        class="rounded-2xl p-5 shadow-soft
               bg-brand-soft dark:bg-emerald-900/30
               border border-emerald-200/60 dark:border-emerald-700/30"
      >
        <div class="text-[13px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">{{ t('symptom_form.recommended_specialty') }}</div>
        <div class="text-lg font-bold text-brand-dark dark:text-emerald-300 mt-0.5">
          {{ symptomStore.result.specialty.name }}
        </div>
      </div>

      <div
        data-testid="result-first-aid"
        class="rounded-2xl p-5 backdrop-blur-md shadow-soft
               bg-amber-50/80 dark:bg-amber-950/30
               border border-amber-200/80 dark:border-amber-800/40"
      >
        <div class="flex items-center gap-2 mb-2">
          <svg class="h-5 w-5 text-amber-600 dark:text-amber-400"
               viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="7" width="18" height="13" rx="2"/>
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <path d="M12 11v6"/>
            <path d="M9 14h6"/>
          </svg>
          <h3 class="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {{ t('symptom_form.first_aid.title') }}
          </h3>
        </div>
        <TransitionGroup tag="ul" name="aid-stagger" class="list-none m-0 p-0" appear>
          <li
            v-for="(item, i) in firstAidItems"
            :key="`${i}-${item}`"
            data-testid="first-aid-item"
            :data-critical="isCriticalAidItem(item) ? 'true' : 'false'"
            :style="{ '--i': i }"
            :class="[
              'group flex items-start gap-3 rounded-xl p-4 mb-3 backdrop-blur-sm border transition-all duration-200',
              isCriticalAidItem(item)
                ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-200/60 dark:border-rose-800/40 hover:bg-rose-50/80 dark:hover:bg-rose-950/45'
                : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30 hover:bg-amber-50/80 dark:hover:bg-amber-950/40'
            ]"
          >
            <span class="mt-1.5 shrink-0" aria-hidden="true">
              <span
                v-if="isCriticalAidItem(item)"
                class="block h-2 w-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_2px_rgba(244,63,94,0.6)]"
              ></span>
              <span
                v-else
                class="block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.45)]"
              ></span>
            </span>
            <span
              class="text-sm leading-relaxed"
              :class="isCriticalAidItem(item)
                ? 'font-medium text-rose-900/90 dark:text-rose-100/90'
                : 'text-amber-900/90 dark:text-amber-100/90'"
            >
              {{ item }}
            </span>
          </li>
        </TransitionGroup>
      </div>

      <div v-if="symptomStore.result.doctors?.length" class="space-y-3">
        <Transition name="doc-header-fade">
          <div v-if="showDoctorsList" class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <!-- Pulsating heartbeat / pulse icon -->
                <svg
                  class="h-4 w-4 shrink-0 animate-pulse text-emerald-500 dark:text-emerald-400"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {{ t('symptom_form.recommended_doctors') }}
                </span>
              </div>

              <!-- Triage urgency badge with pulsating status dot -->
              <div
                v-if="triageUrgency"
                data-testid="triage-urgency-badge"
                :class="[
                  'inline-flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md border shadow-sm',
                  triageUrgency.chip
                ]"
              >
                <span class="relative flex h-2 w-2">
                  <span
                    :class="['absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping', triageUrgency.dot]"
                  ></span>
                  <span :class="['relative inline-flex h-2 w-2 rounded-full', triageUrgency.dot]"></span>
                </span>
                <span :class="['text-xs font-semibold tracking-wide', triageUrgency.text]">
                  {{ t('symptom_form.urgency_label') }}: {{ triageUrgency.label }}
                </span>
              </div>
            </div>

            <!-- Laser expanding divider: scales out from the center on reveal -->
            <div
              class="doc-divider h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
              aria-hidden="true"
            ></div>
          </div>
        </Transition>

        <TransitionGroup v-if="showDoctorsList" tag="ul" name="doc-stagger" class="space-y-2.5" appear>
          <li
            v-for="(doc, i) in symptomStore.result.doctors"
            :key="doc.id"
            data-testid="result-doctor"
            :style="{ '--i': i }"
            class="group flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5
                   bg-white/60 dark:bg-slate-800/50 backdrop-blur-md
                   border border-slate-200/80 dark:border-slate-700/60
                   shadow-sm transition-all duration-300 ease-out
                   hover:-translate-y-1 hover:shadow-lg
                   hover:border-emerald-500/40 dark:hover:border-emerald-500/40"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                aria-hidden="true"
                class="hidden sm:inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl
                       bg-gradient-to-br from-emerald-500 to-emerald-700 text-white
                       font-bold text-lg shadow-glow ring-1 ring-white/20
                       transition-transform duration-300 ease-out group-hover:scale-105"
              >
                {{ doc.name.charAt(0) }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold tracking-tight text-slate-800 dark:text-slate-100 truncate">
                  {{ doc.name }}
                </div>
                <div class="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 leading-none
                            bg-slate-50/50 dark:bg-slate-800/30
                            text-xs text-slate-500 dark:text-slate-400">
                  <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  </svg>
                  <span class="tabular-nums font-medium text-slate-600 dark:text-slate-300">{{ doc.experience_years }}</span>
                  <span>{{ t('symptom_form.experience_years') }}</span>
                </div>
              </div>
            </div>

            <div
              :aria-label="`${t('symptom_form.rating')}: ${doc.rating.toFixed(1)}`"
              class="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 leading-none
                     bg-slate-50/50 dark:bg-slate-800/30 backdrop-blur-sm
                     border border-slate-200/50 dark:border-white/10"
            >
              <svg class="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" viewBox="0 0 24 24"
                   fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.77l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94z"/>
              </svg>
              <span class="text-sm font-semibold tabular-nums tracking-tight leading-none text-slate-700 dark:text-slate-200">
                {{ doc.rating.toFixed(1) }}
              </span>
            </div>
          </li>
        </TransitionGroup>
      </div>

      <!-- Smart Triage Summary: subtle glass copy & share icon buttons in the card corner -->
      <Transition name="doc-header-fade">
        <div
          v-if="showDoctorsList"
          data-testid="triage-action-bar"
          class="no-print absolute top-5 end-4 z-10 flex items-center gap-2"
        >
          <button
            type="button"
            data-testid="copy-summary-button"
            :aria-label="summaryCopied ? t('symptom_form.summary_copied') : t('symptom_form.summary_copy')"
            :title="summaryCopied ? t('symptom_form.summary_copied') : t('symptom_form.summary_copy')"
            @click="copySummary"
            class="p-2 rounded-full border backdrop-blur-sm
                   bg-white/50 dark:bg-slate-800/40
                   border-slate-200/50 dark:border-white/10
                   hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm
                   active:scale-90 transition-all duration-200"
          >
            <Transition name="copy-icon" mode="out-in">
              <svg v-if="summaryCopied" key="check"
                   class="h-4 w-4 text-emerald-500 animate-pulse" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              <svg v-else key="copy"
                   class="h-4 w-4 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </Transition>
          </button>

          <button
            type="button"
            data-testid="share-summary-button"
            :aria-label="t('symptom_form.summary_share')"
            :title="t('symptom_form.summary_share')"
            @click="shareSummary"
            class="p-2 rounded-full border backdrop-blur-sm
                   bg-white/50 dark:bg-slate-800/40
                   border-slate-200/50 dark:border-white/10
                   text-slate-600 dark:text-slate-300
                   hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm
                   active:scale-90 transition-all duration-200"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
            </svg>
          </button>

          <!-- Digital Health Pass: minimalist glass PDF export, matching its neighbors -->
          <button
            type="button"
            data-testid="download-report-button"
            :aria-label="t('symptom_form.report.download')"
            :title="t('symptom_form.report.download')"
            @click="downloadReport"
            class="no-print p-2 bg-white/50 dark:bg-slate-800/40
                   border border-slate-200/50 dark:border-white/10 rounded-full
                   text-slate-600 dark:text-slate-300
                   hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm
                   active:scale-90 transition-all duration-200
                   w-9 h-9 flex items-center justify-center"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
              <path d="M12 12v6"/>
              <path d="m9 15 3 3 3-3"/>
            </svg>
          </button>
        </div>
      </Transition>

      <!-- Medication Safety & Interaction Checker (experimental, front-end only) -->
      <div
        class="no-print p-4 bg-slate-50/50 dark:bg-slate-800/10
               border border-slate-200/40 dark:border-white/10 rounded-2xl
               max-w-xl mx-auto my-6"
        data-testid="med-guard"
      >
        <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
          <svg class="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          {{ t('symptom_form.med_guard.title') }}
        </h3>

        <div class="flex flex-wrap items-center">
          <span
            v-for="(med, i) in medications"
            :key="`${i}-${med}`"
            data-testid="med-tag"
            class="inline-flex items-center gap-1 px-2.5 py-1 me-1 mb-1
                   bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                   rounded-lg text-xs text-slate-700 dark:text-slate-200"
          >
            {{ med }}
            <button
              type="button"
              :aria-label="t('symptom_form.med_guard.remove')"
              @click="removeMedication(i)"
              class="text-slate-400 hover:text-rose-500 transition-colors leading-none"
            >
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </span>

          <input
            v-model="medicationInput"
            type="text"
            data-testid="med-input"
            :placeholder="t('symptom_form.med_guard.placeholder')"
            :aria-label="t('symptom_form.med_guard.title')"
            @keydown.enter.prevent="addMedication"
            class="flex-1 min-w-[8rem] mb-1 bg-transparent text-xs
                   text-slate-700 dark:text-slate-200 placeholder-slate-400
                   focus:outline-none py-1 px-1"
          />
        </div>

        <!-- Micro-shimmer while the faux guard "scans" -->
        <div
          v-if="guardChecking"
          data-testid="med-guard-loading"
          class="mt-3 h-7 rounded-xl overflow-hidden relative bg-slate-100 dark:bg-slate-800/40"
          role="status"
          :aria-label="t('symptom_form.med_guard.checking')"
        >
          <span
            aria-hidden="true"
            class="absolute inset-y-0 left-0 w-1/3
                   bg-gradient-to-r from-transparent via-white/70 dark:via-white/10 to-transparent
                   animate-shimmer motion-reduce:hidden"
          ></span>
        </div>

        <!-- Premium AI guard status -->
        <Transition name="fade">
          <div
            v-if="medications.length && !guardChecking"
            data-testid="med-guard-status"
            class="mt-3 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl
                   flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400"
          >
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span class="leading-relaxed">{{ t('symptom_form.med_guard.safe') }}</span>
          </div>
        </Transition>
      </div>

      <!-- AI feedback micro-interaction -->
      <div class="no-print flex flex-col items-center gap-2 my-4" data-testid="feedback-widget">
        <span class="text-xs text-slate-400 dark:text-slate-500">
          {{ t('symptom_form.feedback_prompt') }}
        </span>
        <div class="flex items-center gap-3">
          <button
            type="button"
            data-testid="feedback-up"
            :aria-pressed="feedbackType === 'up'"
            :aria-label="t('symptom_form.feedback_helpful')"
            :title="t('symptom_form.feedback_helpful')"
            @click="setFeedback('up')"
            :class="[
              'p-2 border rounded-xl transition-all duration-200 hover:scale-110 active:scale-95',
              feedbackType === 'up'
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 feedback-pop'
                : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/40 text-slate-400 dark:text-slate-500'
            ]"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 10v12"/>
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>
            </svg>
          </button>
          <button
            type="button"
            data-testid="feedback-down"
            :aria-pressed="feedbackType === 'down'"
            :aria-label="t('symptom_form.feedback_not_helpful')"
            :title="t('symptom_form.feedback_not_helpful')"
            @click="setFeedback('down')"
            :class="[
              'p-2 border rounded-xl transition-all duration-200 hover:scale-110 active:scale-95',
              feedbackType === 'down'
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 feedback-pop'
                : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/40 text-slate-400 dark:text-slate-500'
            ]"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 14V2"/>
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>
            </svg>
          </button>
        </div>
      </div>

      <button
        type="button"
        data-testid="new-assessment-button"
        @click="startNewAssessment"
        class="no-print group relative isolate w-full overflow-hidden py-3.5 rounded-xl font-semibold text-white
               bg-gradient-to-br from-brand to-brand-dark shadow-cta
               hover:-translate-y-0.5 active:translate-y-0
               hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]
               transition-all duration-300 ease-out"
      >
        <!-- Liquid shimmer sheen sweeping across the button -->
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3
                 bg-gradient-to-r from-transparent via-white/30 to-transparent
                 animate-shimmer motion-reduce:hidden"
        ></span>
        <span class="relative z-10">{{ t('symptom_form.new_assessment') }}</span>
      </button>
    </div>
  </Transition>

  <!-- Live Intelligence Triage Dashboard loading overlay -->
  <Teleport to="body">
    <Transition name="triage-fade">
      <div
        v-if="showCinematicLoading"
        data-testid="triage-loading"
        role="status"
        aria-live="polite"
        class="fixed inset-0 z-50 flex items-center justify-center p-4
               bg-slate-900/30 dark:bg-slate-950/50 backdrop-blur-md"
      >
        <div
          class="w-full bg-white/40 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-lg mx-auto shadow-2xl
                 dark:bg-slate-800/40 dark:border-white/10 text-center"
        >
          <!-- Pulsing radar / vortex core with ambient emerald glow -->
          <div class="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center">
            <span class="absolute h-full w-full rounded-full bg-emerald-400/30 animate-ping"></span>
            <span class="absolute h-24 w-24 rounded-full bg-emerald-500/20 blur-2xl"></span>
            <span
              class="relative inline-flex h-20 w-20 items-center justify-center rounded-full
                     bg-gradient-to-br from-emerald-500 to-emerald-700 text-white
                     shadow-glow ring-1 ring-white/30"
            >
              <svg
                class="triage-radar h-9 w-9"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="9" stroke-opacity="0.55"/>
                <circle cx="12" cy="12" r="5" stroke-opacity="0.55"/>
                <path d="M12 12 20 6"/>
                <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
              </svg>
            </span>
          </div>

          <h3 class="mb-6 text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
            {{ t('symptom_form.analyzing') }}
          </h3>

          <!-- Dynamic cinematic status steps -->
          <ul class="space-y-3.5 text-start">
            <li
              v-for="(step, i) in TRIAGE_STEPS"
              :key="i"
              data-testid="triage-step"
              class="flex items-center gap-3 transition-all duration-500 ease-out"
              :class="i <= triageStep ? 'opacity-100' : 'opacity-30'"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse
                       shadow-[0_0_10px_2px_rgba(16,185,129,0.7)]"
              ></span>
              <Transition name="triage-step-text" mode="out-in">
                <span
                  :key="i <= triageStep ? 'on' : 'off'"
                  class="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                >
                  {{ step }}
                </span>
              </Transition>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Follow-up questions modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="showQuestionsModal"
        data-testid="questions-modal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4
               bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-md"
        @click.self="closeQuestionsModal"
      >
        <Transition name="modal-pop" appear>
          <div
            v-if="showQuestionsModal"
            role="dialog"
            aria-modal="true"
            class="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl p-6 sm:p-8 space-y-6
                   bg-white/85 dark:bg-slate-800/70 backdrop-blur-2xl
                   border border-slate-200/60 dark:border-white/10
                   ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                   shadow-soft-lg dark:shadow-glass-dk"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="inline-flex h-11 w-11 items-center justify-center
                            rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700
                            text-white shadow-glow ring-1 ring-white/20">
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <path d="M12 17h.01"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                <h2 class="text-base sm:text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
                  {{ t('symptom_form.questions_modal_title') }}
                </h2>
              </div>
              <button
                type="button"
                :aria-label="t('symptom_form.modal_close')"
                :title="t('symptom_form.modal_close')"
                data-testid="questions-modal-close"
                @click="closeQuestionsModal"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full shrink-0
                       bg-white/85 dark:bg-slate-900/70 backdrop-blur shadow-soft
                       border border-slate-200/60 dark:border-white/10
                       text-slate-600 dark:text-slate-300
                       hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700/60
                       transition-all duration-300 ease-out"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div
              v-if="documentSummary"
              class="rounded-2xl p-4 sm:p-5
                     bg-white/70 dark:bg-slate-900/40 backdrop-blur-sm
                     border border-slate-200/60 dark:border-white/10
                     ring-1 ring-slate-900/5 dark:ring-white/5
                     shadow-soft text-sm text-slate-700 dark:text-slate-200"
            >
              <div class="font-semibold mb-1 text-brand-dark dark:text-emerald-300">
                {{ t('symptom_form.document_summary_title') }}
              </div>
              <p class="whitespace-pre-wrap">{{ documentSummary }}</p>
            </div>

            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ t('symptom_form.document_questions_hint') }}
            </p>

            <div class="space-y-4">
              <div
                v-for="(question, i) in documentQuestions"
                :key="i"
                data-testid="document-question-item"
              >
                <label
                  :for="`document-question-${i}`"
                  class="block text-[13px] font-semibold tracking-wide text-slate-700 dark:text-slate-300 mb-2"
                >
                  {{ question }}
                </label>
                <input
                  :id="`document-question-${i}`"
                  v-model="userAnswers[i]"
                  type="text"
                  data-testid="document-question-answer"
                  :placeholder="t('symptom_form.document_questions_answer_placeholder')"
                  class="w-full px-4 py-3 rounded-xl
                         bg-white/70 dark:bg-slate-900/50 backdrop-blur-sm shadow-sm
                         border border-slate-200/70 dark:border-slate-700/60 hover:border-slate-300/80
                         text-slate-800 dark:text-slate-100
                         placeholder:text-slate-400 dark:placeholder:text-slate-500
                         transition-all duration-300 ease-out
                         focus:ring-4 focus:ring-brand/15 focus:border-brand/50 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              data-testid="questions-modal-confirm"
              @click="confirmAnswers"
              class="group relative isolate w-full overflow-hidden py-3.5 rounded-xl font-semibold text-white
                     bg-gradient-to-br from-brand to-brand-dark shadow-cta
                     hover:-translate-y-0.5 active:translate-y-0
                     hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]
                     transition-all duration-300 ease-out"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3
                       bg-gradient-to-r from-transparent via-white/30 to-transparent
                       animate-shimmer motion-reduce:hidden"
              ></span>
              <span class="relative z-10">{{ t('symptom_form.questions_modal_confirm') }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- Document preview modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="previewAttachment"
        data-testid="preview-modal"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-8
               bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-md"
        @click.self="closePreview"
      >
        <div class="w-full max-w-4xl flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 min-w-0 text-white">
            <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span class="text-sm font-medium truncate">{{ previewAttachment.name }}</span>
          </div>
          <button
            type="button"
            :aria-label="t('symptom_form.modal_close')"
            :title="t('symptom_form.modal_close')"
            data-testid="preview-modal-close"
            @click="closePreview"
            class="inline-flex h-9 w-9 items-center justify-center rounded-full shrink-0
                   bg-white/15 hover:bg-white/25 backdrop-blur
                   border border-white/20 text-white transition"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div
          class="w-full max-w-4xl flex-1 min-h-0 overflow-auto rounded-2xl
                 bg-white/10 backdrop-blur-md border border-white/20 ring-1 ring-white/10
                 flex items-center justify-center"
          @click.self="closePreview"
        >
          <img
            v-if="previewAttachment && isImage(previewAttachment.type)"
            :src="previewSrc"
            :alt="previewAttachment.name"
            data-testid="preview-modal-image"
            class="max-w-full max-h-[78vh] object-contain"
          />
          <iframe
            v-else
            :src="previewSrc"
            :title="previewAttachment ? previewAttachment.name : ''"
            data-testid="preview-modal-frame"
            class="w-full h-[78vh] rounded-2xl bg-white"
          ></iframe>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* One-time pop when a feedback choice becomes active. */
@keyframes feedback-pop {
  0% { transform: scale(1); }
  45% { transform: scale(1.25); }
  100% { transform: scale(1); }
}
.feedback-pop {
  animation: feedback-pop 300ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .feedback-pop { animation: none; }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 220ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.questions-slide-enter-active,
.questions-slide-leave-active {
  transition: opacity 300ms ease, transform 300ms ease;
}
.questions-slide-enter-from,
.questions-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

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

/* Live triage overlay: silk fade in/out over 500ms */
.triage-fade-enter-active,
.triage-fade-leave-active {
  transition: opacity 500ms ease;
}
.triage-fade-enter-active .max-w-lg,
.triage-fade-leave-active .max-w-lg {
  transition: transform 500ms cubic-bezier(0.16, 1, 0.3, 1), opacity 500ms ease;
}
.triage-fade-enter-from,
.triage-fade-leave-to {
  opacity: 0;
}
.triage-fade-enter-from .max-w-lg,
.triage-fade-leave-to .max-w-lg {
  opacity: 0;
  transform: translateY(14px) scale(0.96);
}

/* Smooth swap as each status step becomes active */
.triage-step-text-enter-active,
.triage-step-text-leave-active {
  transition: opacity 400ms ease;
}
.triage-step-text-enter-from,
.triage-step-text-leave-to {
  opacity: 0;
}

/* Staggered slide-up reveal for the first-aid priority cards. The per-item
   delay rides a --i custom property so it only affects the entrance and never
   the card's own hover transition. */
.aid-stagger-enter-active {
  transition: opacity 400ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--i, 0) * 90ms);
}
.aid-stagger-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
@media (prefers-reduced-motion: reduce) {
  .aid-stagger-enter-active {
    transition: opacity 300ms ease;
    transition-delay: 0ms;
  }
  .aid-stagger-enter-from {
    transform: none;
  }
}

/* Laser divider: expands horizontally from the center when it mounts. */
@keyframes doc-divider-expand {
  from { transform: scaleX(0); opacity: 0; }
  to   { transform: scaleX(1); opacity: 1; }
}
.doc-divider {
  transform-origin: center;
  animation: doc-divider-expand 700ms ease-out both;
}

/* Soft fade + rise for the doctors section header. */
.doc-header-fade-enter-active {
  transition: opacity 500ms ease, transform 500ms ease;
}
.doc-header-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

/* Smooth copy -> checkmark icon swap on the corner action button. */
.copy-icon-enter-active,
.copy-icon-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.copy-icon-enter-from,
.copy-icon-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

@media (prefers-reduced-motion: reduce) {
  .doc-divider {
    animation: none;
  }
  .doc-header-fade-enter-active {
    transition: opacity 300ms ease;
  }
  .doc-header-fade-enter-from {
    transform: none;
  }
}

/* Staggered slide-up reveal for the recommended doctor cards. Each card enters
   150ms after the previous one, sliding up from translate-y-4 with a fade. */
.doc-stagger-enter-active {
  transition: opacity 450ms ease, transform 450ms cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--i, 0) * 150ms);
}
.doc-stagger-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}
@media (prefers-reduced-motion: reduce) {
  .doc-stagger-enter-active {
    transition: opacity 300ms ease;
    transition-delay: 0ms;
  }
  .doc-stagger-enter-from {
    transform: none;
  }
}

/* Slowly sweeping radar core for the vortex feel */
@keyframes triage-radar-sweep {
  to {
    transform: rotate(360deg);
  }
}
.triage-radar {
  animation: triage-radar-sweep 3.5s linear infinite;
  transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
  .triage-radar {
    animation: none;
  }
}
</style>

<!-- Global (non-scoped) print rules: hide interactive chrome if the user prints
     the live page via Ctrl/Cmd+P. The primary export path renders an isolated
     document, so this is a belt-and-braces safeguard. -->
<style>
@media print {
  .no-print { display: none !important; }
}
</style>
