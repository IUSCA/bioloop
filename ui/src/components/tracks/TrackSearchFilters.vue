<template>
  <div class="flex gap-2 flex-grow items-center">
    <!-- name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filters.name"
      @click="emit('open')"
      @update:model-value="removeFilter('name')"
    >
      Name: &nbsp;
      <span class="font-semibold"> {{ filters.name }} </span>
    </va-chip>

    <!-- project_id filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filters.project_id"
      @click="emit('open')"
      @update:model-value="removeFilter('project_id')"
    >
      Project ID: &nbsp;
      <span class="font-semibold"> {{ filters.project_id }} </span>
    </va-chip>

    <!-- file_type filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filters.file_type"
      @click="emit('open')"
      @update:model-value="removeFilter('file_type')"
    >
      File Type: &nbsp;
      <span class="font-semibold"> {{ filters.file_type }} </span>
    </va-chip>

    <!-- genome_type filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filters.genome_type"
      @click="emit('open')"
      @update:model-value="removeFilter('genome_type')"
    >
      Genome Type: &nbsp;
      <span class="font-semibold"> {{ filters.genome_type }} </span>
    </va-chip>

    <!-- genome_value filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filters.genome_value"
      @click="emit('open')"
      @update:model-value="removeFilter('genome_value')"
    >
      Genome Value: &nbsp;
      <span class="font-semibold"> {{ filters.genome_value }} </span>
    </va-chip>

    <!-- reset search -->
    <va-button
      @click="clearAll"
      preset="secondary"
      round
      class="flex-none ml-auto"
      v-if="hasActiveFilters"
    >
      <span class="text-sm"> Reset </span>
    </va-button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  filters: {
    type: Object,
    required: true,
    default: () => ({
      name: '',
      project_id: '',
      file_type: null,
      genome_type: null,
      genome_value: null,
    }),
  },
});

const emit = defineEmits(["search", "open", "remove-filter", "clear-all"]);

// Computed
const hasActiveFilters = computed(() => {
  return Object.values(props.filters).some(value => value && value !== '');
});

// Methods
function removeFilter(field) {
  emit('remove-filter', field);
}

function clearAll() {
  emit('clear-all');
}
</script> 