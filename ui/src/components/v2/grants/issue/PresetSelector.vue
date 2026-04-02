<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="preset in props.presets"
      :key="preset.id"
      class="cursor-pointer rounded-lg border border-solid p-3 transition-colors"
      :class="
        props.modelValue === preset.id
          ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950'
          : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
      "
      :aria-pressed="props.modelValue === preset.id"
      :aria-checked="props.modelValue === preset.id"
      role="radio"
      @click="toggle(preset.id)"
      @keydown.enter.prevent="toggle(preset.id)"
      @keydown.space.prevent="toggle(preset.id)"
      tabindex="0"
    >
      <div class="flex items-start gap-3">
        <!-- Radio indicator -->
        <div
          class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-solid transition-colors"
          :class="
            props.modelValue === preset.id
              ? 'border-blue-500 dark:border-blue-400'
              : 'border-gray-300 dark:border-gray-600'
          "
        >
          <div
            v-if="props.modelValue === preset.id"
            class="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400"
          />
        </div>

        <div class="min-w-0 flex-1">
          <p
            class="text-sm font-medium"
            :class="
              props.modelValue === preset.id
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-gray-900 dark:text-gray-100'
            "
          >
            {{ preset.name }}
          </p>
          <p
            class="mb-2 mt-0.5 text-xs"
            :class="
              props.modelValue === preset.id
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400'
            "
          >
            {{ preset.description }}
          </p>

          <!-- Access type pills -->
          <div class="flex flex-wrap gap-1">
            <span
              v-for="item in preset.access_type_items"
              :key="item.access_type_id"
              class="rounded-full px-2 py-0.5 text-xs"
              :class="
                props.modelValue === preset.id
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700'
              "
            >
              {{ item.access_type?.description ?? item.access_type_id }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();

const props = defineProps({
  /** Full list of preset objects: { id, name, description, access_type_ids } */
  presets: {
    type: Array,
    required: true,
  },
});

// Toggle selection: if already selected, deselect (set to null); otherwise select the new id
function toggle(id) {
  model.value = model.value === id ? null : id;
}
</script>
