<template>
  <div>
    <span
      v-if="props.progress?.name"
      class="text-slate-500 flex-initial text-sm"
    >
      {{ props.progress?.name }}
    </span>

    <va-progress-circle
      v-if="props.progress?.percent_done"
      class="flex-initial"
      :thickness="0.1"
      :modelValue="props.progress?.percent_done"
    >
      {{ props.progress?.percent_done }}%
    </va-progress-circle>

    <span
      v-if="props.progress?.time_remaining"
      class="text-slate-500 flex-initial text-sm"
    >
      {{ props.progress.time_remaining }} remaining
    </span>
  </div>
</template>

<script setup>
const props = defineProps({ progress: Object });
</script>
