<template>
  <div class="flex flex-col">
    <div
      v-for="type in props.accessTypes"
      :key="type.id"
      class="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors"
      :class="{
        'cursor-default opacity-50': props.presetCoveredIds.has(type.id),
        'bg-blue-50 dark:bg-blue-950': props.modelValue.has(type.id),
      }"
      :aria-disabled="props.presetCoveredIds.has(type.id)"
      @click="toggle(type.id)"
      @keydown.enter.prevent="toggle(type.id)"
      @keydown.space.prevent="toggle(type.id)"
      tabindex="0"
      role="button"
    >
      <VaCheckbox
        :model-value="
          props.modelValue.has(type.id) || props.presetCoveredIds.has(type.id)
        "
        :disabled="props.presetCoveredIds.has(type.id)"
        class="mt-0.5 shrink-0 pointer-events-none"
        :aria-label="type.description"
      />
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="text-sm font-medium"
            :class="
              props.modelValue.has(type.id)
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-gray-800 dark:text-gray-200'
            "
          >
            {{ type.description }}
          </span>
          <span
            v-if="props.presetCoveredIds.has(type.id)"
            class="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300"
          >
            via preset
          </span>
        </div>
        <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          {{ type.long_description }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();

const props = defineProps({
  /** Full list of access type objects: { id, name, description, long_description } */
  accessTypes: {
    type: Array,
    required: true,
  },
  /** Set<number> of IDs already covered by the selected preset */
  presetCoveredIds: {
    type: Set,
    default: () => new Set(),
  },
});

function toggle(id) {
  if (props.presetCoveredIds.has(id)) return;
  const next = new Set(model.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  model.value = next;
}
</script>
