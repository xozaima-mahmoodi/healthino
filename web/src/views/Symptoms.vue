<script setup>
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import SymptomForm from '../components/SymptomForm.vue'
import { useSymptomStore } from '../stores/symptom'

const { t } = useI18n()
const symptomStore = useSymptomStore()
</script>

<template>
  <main class="min-h-screen">
    <header class="px-4 py-4 sm:px-8 flex items-center justify-end border-b border-slate-200 bg-white">
      <LanguageSwitcher />
    </header>

    <section class="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">
        {{ t('symptom_form.title') }}
      </h1>

      <div class="bg-white rounded-2xl shadow-sm p-5 sm:p-7 border border-slate-200">
        <SymptomForm />
      </div>

      <div v-if="symptomStore.result" class="mt-8 space-y-4">
        <h2 class="text-lg font-semibold text-slate-800">{{ t('symptom_form.result_title') }}</h2>

        <div
          v-if="symptomStore.result.red_flag"
          class="rounded-xl bg-red-50 border border-red-200 text-red-800 p-4 font-medium"
        >
          {{ t('symptom_form.red_flag_warning') }}
        </div>

        <div v-if="symptomStore.result.specialty" class="rounded-xl bg-brand-soft p-4">
          <div class="text-sm text-slate-500">{{ t('symptom_form.recommended_specialty') }}</div>
          <div class="text-lg font-semibold text-brand-dark">
            {{ symptomStore.result.specialty.name }}
          </div>
        </div>

        <div v-if="symptomStore.result.doctors?.length" class="space-y-3">
          <div class="text-sm font-medium text-slate-700">{{ t('symptom_form.recommended_doctors') }}</div>
          <ul class="space-y-2">
            <li
              v-for="doc in symptomStore.result.doctors"
              :key="doc.id"
              class="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between"
            >
              <div>
                <div class="font-semibold text-slate-900">{{ doc.name }}</div>
                <div class="text-sm text-slate-500">
                  {{ doc.experience_years }} {{ t('symptom_form.experience_years') }}
                </div>
              </div>
              <div class="text-sm">
                <span class="font-semibold text-amber-500">★ {{ doc.rating.toFixed(1) }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </main>
</template>
