<template>
  <div class="flex flex-col gap-4">
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
    >
      <div>
        <p
          class="text-sm tracking-widest text-slate-500 dark:text-slate-400 uppercase"
        >
          {{ subtitle }}
        </p>
        <h1
          class="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-white"
        >
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="mt-2 text-sm text-slate-600 dark:text-slate-300"
        >
          {{ description }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <span
          v-if="roleLabel"
          class="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {{ roleLabel }}
        </span>
        <slot name="meta" />
      </div>
    </div>

    <div
      v-if="$slots.descriptionExtra"
      class="text-sm text-slate-600 dark:text-slate-300"
    >
      <slot name="descriptionExtra" />
    </div>
  </div>
</template>

<script setup>
const { title, subtitle, description, roleLabel } = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  description: { type: String, default: "" },
  roleLabel: { type: String, default: "" },
});
</script>
