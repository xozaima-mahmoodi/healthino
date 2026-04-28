<script setup>
import { reactive, computed } from 'vue'
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

const form = reactive({
  symptomChoice: '',
  additionalInfo: '',
  severity: 5,
  body_area: '',
  duration_hours: null
})

const bodyAreas = ['head', 'skin', 'chest', 'abdomen', 'joints']

const canSubmit = computed(() => {
  if (symptomStore.submitting) return false
  return !!form.symptomChoice
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
