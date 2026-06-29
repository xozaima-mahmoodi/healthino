<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import GlobalHeader from '../components/GlobalHeader.vue'
import SymptomForm from '../components/SymptomForm.vue'
import { useSymptomStore } from '../stores/symptom'

const { t } = useI18n()
const symptomStore = useSymptomStore()

onMounted(() => {
  symptomStore.reset()
})
</script>

<template>
  <main class="min-h-screen mesh-bg">
    <GlobalHeader />

    <section class="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-14">
      <div class="max-w-2xl mx-auto">
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-8">
          {{ t('symptom_form.title') }}
        </h1>

        <SymptomForm />
      </div>
    </section>
  </main>
</template>
