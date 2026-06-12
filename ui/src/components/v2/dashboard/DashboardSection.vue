<template>
  <VaCard class="h-full">
    <VaCardContent>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ title }}
          </h2>
          <p v-if="subtitle" class="text-sm text-slate-500 dark:text-slate-400">
            {{ subtitle }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <slot name="actions" />
        </div>
      </div>

      <div class="mt-4">
        <slot />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const { title, subtitle } = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
});
</script>
