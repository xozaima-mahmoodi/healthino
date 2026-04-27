<script setup>
import { useI18n } from 'vue-i18n'
import GlobalHeader from '../components/GlobalHeader.vue'
import SymptomForm from '../components/SymptomForm.vue'
import { useSymptomStore } from '../stores/symptom'

const { t } = useI18n()
const symptomStore = useSymptomStore()
</script>

<template>
  <main class="min-h-screen mesh-bg">
    <GlobalHeader />

    <section class="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6">
          {{ t('symptom_form.title') }}
        </h1>

        <div class="rounded-2xl p-5 sm:p-7
                    bg-white/80 dark:bg-slate-800/40 backdrop-blur-xl
                    border border-white/60 dark:border-white/10
                    ring-1 ring-slate-900/5 dark:ring-emerald-400/15
                    shadow-glass dark:shadow-glass-dk">
          <SymptomForm />
        </div>

        <div v-if="symptomStore.result" class="mt-8 space-y-4">
          <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100">{{ t('symptom_form.result_title') }}</h2>

          <div
            v-if="symptomStore.result.red_flag"
            class="rounded-xl p-4 font-medium
                   bg-red-50 dark:bg-red-950/40
                   border border-red-200 dark:border-red-700/40
                   text-red-800 dark:text-red-200"
          >
            {{ t('symptom_form.red_flag_warning') }}
          </div>

          <div v-if="symptomStore.result.specialty"
               class="rounded-xl p-4 bg-brand-soft dark:bg-emerald-900/30 dark:border dark:border-emerald-700/30">
            <div class="text-sm text-slate-500 dark:text-slate-400">{{ t('symptom_form.recommended_specialty') }}</div>
            <div class="text-lg font-semibold text-brand-dark dark:text-emerald-300">
              {{ symptomStore.result.specialty.name }}
            </div>
          </div>

          <div v-if="symptomStore.result.doctors?.length" class="space-y-3">
            <div class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ t('symptom_form.recommended_doctors') }}</div>
            <ul class="space-y-2">
              <li
                v-for="doc in symptomStore.result.doctors"
                :key="doc.id"
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
        </div>
      </div>
    </section>
  </main>
</template>
