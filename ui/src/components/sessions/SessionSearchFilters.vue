<template>
  <div class="session-search-filters mb-4">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-sm text-gray-600">Active filters:</span>
      
      <va-chip
        v-if="filters.title"
        size="small"
        removable
        @remove="$emit('remove-filter', 'title')"
      >
        Title: {{ filters.title }}
      </va-chip>
      
      <va-chip
        v-if="filters.genome"
        size="small"
        removable
        @remove="$emit('remove-filter', 'genome')"
      >
        Genome: {{ filters.genome }}
      </va-chip>
      
      <va-chip
        v-if="filters.genome_type"
        size="small"
        removable
        @remove="$emit('remove-filter', 'genome_type')"
      >
        Genome Type: {{ filters.genome_type }}
      </va-chip>
      
      <va-button
        v-if="hasActiveFilters"
        preset="plain"
        size="small"
        @click="$emit('clear-all')"
      >
        Clear all
      </va-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  filters: { type: Object, required: true },
});

defineEmits(['remove-filter', 'clear-all']);

const hasActiveFilters = computed(() => {
  return Object.values(props.filters).some(value => value && value.trim() !== '');
});
</script> 