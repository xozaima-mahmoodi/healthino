<script setup>
import { reactive, ref, computed, onBeforeUnmount } from 'vue'
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

const ACCEPTED_TYPES = 'image/*,application/pdf'

const form = reactive({
  symptomChoice: '',
  additionalInfo: '',
  severity: 5,
  body_area: '',
  duration_hours: null,
  attachments: []
})

const isDragging = ref(false)
let nextAttachmentId = 0

const bodyAreas = ['head', 'skin', 'chest', 'abdomen', 'joints']

const canSubmit = computed(() => {
  if (symptomStore.submitting) return false
  return !!form.symptomChoice
})

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

onBeforeUnmount(() => {
  for (const a of form.attachments) {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
  }
})

async function submit() {
  if (!canSubmit.value) return
  const symptoms = [t(`symptoms.${form.symptomChoice}`)]
  const extra = form.additionalInfo.trim()
  if (extra) symptoms.push(extra)
  await symptomStore.analyze({
    symptoms,
    severity: Number(form.severity),
    body_area: form.body_area || null,
    duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
    locale: localeStore.current
  })
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {{ t('symptom_form.symptoms_label') }}
      </label>
      <select
        v-model="form.symptomChoice"
        data-testid="primary-symptom-select"
        class="w-full px-4 py-3 rounded-lg
               bg-white dark:bg-slate-900/60
               border border-slate-300 dark:border-slate-600
               text-slate-800 dark:text-slate-100
               focus:ring-2 focus:ring-brand focus:outline-none"
      >
        <option value="" disabled>{{ t('symptom_form.symptoms_select_placeholder') }}</option>
        <option v-for="s in COMMON_SYMPTOMS" :key="s" :value="s">
          {{ t(`symptoms.${s}`) }}
        </option>
      </select>
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
        </label>
        <input
          v-model.number="form.severity"
          type="range"
          min="1"
          max="10"
          class="w-full accent-brand"
        />
        <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ form.severity }}</div>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {{ t('symptom_form.body_area_label') }}
        </label>
        <select
          v-model="form.body_area"
          class="w-full px-4 py-3 rounded-lg
                 bg-white dark:bg-slate-900/60
                 border border-slate-300 dark:border-slate-600
                 text-slate-800 dark:text-slate-100
                 focus:ring-2 focus:ring-brand focus:outline-none"
        >
          <option value="">—</option>
          <option v-for="area in bodyAreas" :key="area" :value="area">
            {{ t(`body_areas.${area}`) }}
          </option>
        </select>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {{ t('symptom_form.duration_label') }}
      </label>
      <input
        v-model.number="form.duration_hours"
        type="number"
        min="0"
        class="w-full px-4 py-3 rounded-lg
               bg-white dark:bg-slate-900/60
               border border-slate-300 dark:border-slate-600
               text-slate-800 dark:text-slate-100
               focus:ring-2 focus:ring-brand focus:outline-none"
      />
    </div>

    <button
      type="submit"
      :disabled="!canSubmit"
      class="w-full py-3 rounded-lg bg-brand text-white font-semibold
             shadow-md hover:bg-brand-dark transition disabled:opacity-50"
    >
      {{ symptomStore.submitting ? t('symptom_form.analyzing') : t('symptom_form.submit') }}
    </button>
  </form>
</template>
