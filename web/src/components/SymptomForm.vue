<script setup>
import { reactive, ref, computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSymptomStore } from '../stores/symptom'
import { useLocaleStore } from '../stores/locale'

const { t } = useI18n()
const symptomStore = useSymptomStore()
const localeStore = useLocaleStore()

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

const initialFormState = () => ({
  symptomChoice: '',
  additionalInfo: '',
  severity: 5,
  body_area: '',
  duration_hours: null,
  attachments: []
})

const initialErrorsState = () => ({
  symptomChoice: '',
  body_area: '',
  duration_hours: ''
})

const form = reactive(initialFormState())
const errors = reactive(initialErrorsState())
const isDragging = ref(false)
let nextAttachmentId = 0

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
  return !errors.symptomChoice && !errors.body_area && !errors.duration_hours
}

watch(() => form.symptomChoice, (v) => { if (v) errors.symptomChoice = '' })
watch(() => form.body_area, (v) => { if (v) errors.body_area = '' })
watch(() => form.duration_hours, (v) => { if (Number(v) > 0) errors.duration_hours = '' })

function resetForm() {
  for (const a of form.attachments) {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
  }
  Object.assign(form, initialFormState())
  clearErrors()
  nextAttachmentId = 0
  isDragging.value = false
}

watch(() => symptomStore.result, (val) => {
  if (val) resetForm()
})

function startNewAssessment() {
  symptomStore.reset()
}

const firstAidItems = computed(() => {
  const fromApi = symptomStore.result?.first_aid
  if (Array.isArray(fromApi) && fromApi.length) return fromApi
  return [
    t('symptom_form.first_aid.default_1'),
    t('symptom_form.first_aid.default_2'),
    t('symptom_form.first_aid.default_3')
  ]
})

onBeforeUnmount(() => {
  for (const a of form.attachments) {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
  }
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
  console.log('[symptom-debug] click → submit()', {
    submitting: symptomStore.submitting,
    form: { ...form, attachments: form.attachments.length }
  })
  if (symptomStore.submitting) {
    console.log('[symptom-debug] submit() guarded — already submitting')
    return
  }
  if (!validate()) {
    console.log('[symptom-debug] submit() blocked by validation', { ...errors })
    return
  }
  const symptoms = [t(`symptoms.${form.symptomChoice}`)]
  const extra = form.additionalInfo.trim()
  if (extra) symptoms.push(extra)
  const payload = {
    symptoms,
    severity: Number(form.severity),
    body_area: form.body_area,
    duration_hours: Number(form.duration_hours),
    locale: localeStore.current
  }
  console.log('[symptom-debug] → POST /api/v1/symptom_checker', payload)
  await symptomStore.analyze(payload)
  console.log('[symptom-debug] ← awaited analyze()', {
    result: !!symptomStore.result,
    error: !!symptomStore.error,
    submitting: symptomStore.submitting
  })
}
</script>

<template>
  <Transition name="fade" mode="out-in">
    <div
      v-if="!symptomStore.result"
      key="form"
      data-testid="form-card"
      class="rounded-2xl p-5 sm:p-7
             bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
             border border-white/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-emerald-400/15
             shadow-glass dark:shadow-glass-dk"
    >
      <form class="space-y-5" novalidate @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {{ t('symptom_form.symptoms_label') }}
            <span class="text-red-500 ms-1" aria-hidden="true">*</span>
          </label>
          <select
            v-model="form.symptomChoice"
            data-testid="primary-symptom-select"
            aria-required="true"
            :aria-invalid="!!errors.symptomChoice"
            :class="[
              'w-full px-4 py-3 rounded-lg',
              'bg-white dark:bg-slate-900/60',
              'text-slate-800 dark:text-slate-100',
              'focus:ring-2 focus:ring-brand focus:outline-none',
              errors.symptomChoice
                ? 'border-2 border-red-400 dark:border-red-500/70'
                : 'border border-slate-300 dark:border-slate-600'
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
            class="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {{ errors.symptomChoice }}
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {{ t('symptom_form.additional_info_label') }}
          </label>
          <textarea
            v-model="form.additionalInfo"
            data-testid="additional-info-input"
            rows="3"
            :placeholder="t('symptom_form.additional_info_placeholder')"
            class="w-full px-4 py-3 rounded-lg resize-y
                   bg-white dark:bg-slate-900/60
                   border border-slate-300 dark:border-slate-600
                   text-slate-800 dark:text-slate-100
                   placeholder:text-slate-400 dark:placeholder:text-slate-500
                   focus:ring-2 focus:ring-brand focus:outline-none"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {{ t('symptom_form.attachments_label') }}
          </label>

          <label
            for="symptom-attachments"
            data-testid="upload-zone"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            :class="[
              'relative flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl cursor-pointer text-center',
              'border-2 border-dashed transition',
              'bg-white/60 dark:bg-slate-900/40 backdrop-blur-md',
              isDragging
                ? 'border-brand bg-brand/5 dark:bg-emerald-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-brand hover:bg-brand/5 dark:hover:bg-emerald-900/20'
            ]"
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
            <input
              id="symptom-attachments"
              type="file"
              multiple
              :accept="ACCEPTED_TYPES"
              data-testid="attachments-input"
              class="sr-only"
              @change="onFileChange"
            />
          </label>

          <ul
            v-if="form.attachments.length"
            data-testid="attachments-preview"
            class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3"
          >
            <li
              v-for="att in form.attachments"
              :key="att.id"
              data-testid="attachment-item"
              :data-name="att.name"
              class="relative rounded-xl overflow-hidden
                     bg-white/80 dark:bg-slate-800/50 backdrop-blur-md
                     border border-white/60 dark:border-white/10
                     ring-1 ring-slate-900/5 dark:ring-white/5"
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
              <button
                type="button"
                :aria-label="t('symptom_form.attachments_remove')"
                :title="t('symptom_form.attachments_remove')"
                data-testid="attachment-remove"
                @click="removeAttachment(att.id)"
                class="absolute top-1.5 end-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full
                       bg-white/90 dark:bg-slate-900/80 backdrop-blur
                       border border-white/70 dark:border-white/10
                       text-slate-700 dark:text-slate-200
                       hover:bg-red-50 hover:text-red-600
                       dark:hover:bg-red-900/40 dark:hover:text-red-300
                       transition shadow"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.4"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </li>
          </ul>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {{ t('symptom_form.severity_label') }}
              <span class="text-red-500 ms-1" aria-hidden="true">*</span>
            </label>
            <input
              v-model.number="form.severity"
              type="range"
              min="1"
              max="10"
              data-testid="severity-input"
              class="w-full accent-brand"
            />
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ form.severity }}</div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {{ t('symptom_form.body_area_label') }}
              <span class="text-red-500 ms-1" aria-hidden="true">*</span>
            </label>
            <select
              v-model="form.body_area"
              data-testid="body-area-select"
              aria-required="true"
              :aria-invalid="!!errors.body_area"
              :class="[
                'w-full px-4 py-3 rounded-lg',
                'bg-white dark:bg-slate-900/60',
                'text-slate-800 dark:text-slate-100',
                'focus:ring-2 focus:ring-brand focus:outline-none',
                errors.body_area
                  ? 'border-2 border-red-400 dark:border-red-500/70'
                  : 'border border-slate-300 dark:border-slate-600'
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
              class="mt-1 text-xs text-red-600 dark:text-red-400"
            >
              {{ errors.body_area }}
            </p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {{ t('symptom_form.duration_label') }}
            <span class="text-red-500 ms-1" aria-hidden="true">*</span>
          </label>
          <input
            v-model.number="form.duration_hours"
            type="number"
            min="1"
            data-testid="duration-input"
            aria-required="true"
            :aria-invalid="!!errors.duration_hours"
            :class="[
              'w-full px-4 py-3 rounded-lg',
              'bg-white dark:bg-slate-900/60',
              'text-slate-800 dark:text-slate-100',
              'focus:ring-2 focus:ring-brand focus:outline-none',
              errors.duration_hours
                ? 'border-2 border-red-400 dark:border-red-500/70'
                : 'border border-slate-300 dark:border-slate-600'
            ]"
          />
          <p
            v-if="errors.duration_hours"
            data-testid="error-duration"
            class="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {{ errors.duration_hours }}
          </p>
        </div>

        <div
          v-if="apiErrorMessages.length"
          data-testid="submit-error"
          role="alert"
          class="rounded-xl p-4 text-sm
                 bg-red-50 dark:bg-red-950/40
                 border border-red-200 dark:border-red-700/40
                 text-red-800 dark:text-red-200"
        >
          <p class="font-medium mb-1">{{ t('symptom_form.submit_error_title') }}</p>
          <ul class="list-disc ps-5 space-y-0.5">
            <li v-for="(msg, i) in apiErrorMessages" :key="i">{{ msg }}</li>
          </ul>
        </div>

        <button
          type="submit"
          :disabled="symptomStore.submitting"
          class="w-full py-3 rounded-lg bg-brand text-white font-semibold
                 shadow-md hover:bg-brand-dark transition disabled:opacity-50"
        >
          {{ symptomStore.submitting ? t('symptom_form.analyzing') : t('symptom_form.submit') }}
        </button>
      </form>
    </div>

    <div
      v-else
      key="result"
      data-testid="result-card"
      class="rounded-2xl p-5 sm:p-7 space-y-5
             bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
             border border-white/60 dark:border-white/10
             ring-1 ring-slate-900/5 dark:ring-emerald-400/15
             shadow-glass dark:shadow-glass-dk"
    >
      <div class="flex items-center gap-3">
        <div class="inline-flex h-10 w-10 items-center justify-center
                    rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700
                    text-white shadow-md shadow-brand/30">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {{ t('symptom_form.result_title') }}
        </h2>
      </div>

      <div
        v-if="symptomStore.result.red_flag"
        data-testid="result-red-flag"
        class="rounded-xl p-4 font-medium
               bg-red-50 dark:bg-red-950/40
               border border-red-200 dark:border-red-700/40
               text-red-800 dark:text-red-200"
      >
        {{ t('symptom_form.red_flag_warning') }}
      </div>

      <div
        v-if="symptomStore.result.specialty"
        data-testid="result-specialty"
        class="rounded-xl p-4 bg-brand-soft dark:bg-emerald-900/30 dark:border dark:border-emerald-700/30"
      >
        <div class="text-sm text-slate-500 dark:text-slate-400">{{ t('symptom_form.recommended_specialty') }}</div>
        <div class="text-lg font-semibold text-brand-dark dark:text-emerald-300">
          {{ symptomStore.result.specialty.name }}
        </div>
      </div>

      <div
        data-testid="result-first-aid"
        class="rounded-xl p-4 backdrop-blur-md
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
        <ul class="list-disc ps-5 space-y-1 text-sm text-amber-900/90 dark:text-amber-100/90">
          <li
            v-for="(item, i) in firstAidItems"
            :key="i"
            data-testid="first-aid-item"
          >
            {{ item }}
          </li>
        </ul>
      </div>

      <div v-if="symptomStore.result.doctors?.length" class="space-y-3">
        <div class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ t('symptom_form.recommended_doctors') }}</div>
        <ul class="space-y-2">
          <li
            v-for="doc in symptomStore.result.doctors"
            :key="doc.id"
            data-testid="result-doctor"
            class="rounded-xl p-4 flex items-center justify-between
                   bg-white/80 dark:bg-slate-800/50 backdrop-blur-md
                   border border-white/60 dark:border-white/10
                   ring-1 ring-slate-900/5 dark:ring-white/5"
          >
            <div>
              <div class="font-semibold text-slate-900 dark:text-slate-100">{{ doc.name }}</div>
              <div class="text-sm text-slate-500 dark:text-slate-400">
                {{ doc.experience_years }} {{ t('symptom_form.experience_years') }}
              </div>
            </div>
            <div class="text-sm">
              <span class="font-semibold text-amber-500 dark:text-amber-400">★ {{ doc.rating.toFixed(1) }}</span>
            </div>
          </li>
        </ul>
      </div>

      <button
        type="button"
        data-testid="new-assessment-button"
        @click="startNewAssessment"
        class="w-full py-3 rounded-lg bg-brand text-white font-semibold
               shadow-md hover:bg-brand-dark transition"
      >
        {{ t('symptom_form.new_assessment') }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 220ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
