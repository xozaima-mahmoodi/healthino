<script setup>
import { useLocaleStore } from '../stores/locale'

const locale = useLocaleStore()
const options = [
  { code: 'fa', label: 'فارسی' },
  { code: 'ckb', label: 'کوردی' }
]
</script>

<template>
  <div class="inline-flex rounded-full bg-white shadow-sm border border-slate-200 p-1">
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      :class="[
        'px-3 py-1 text-sm rounded-full transition',
        locale.current === opt.code ? 'bg-brand text-white' : 'text-slate-600 hover:text-slate-900'
      ]"
      @click="locale.set(opt.code)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
