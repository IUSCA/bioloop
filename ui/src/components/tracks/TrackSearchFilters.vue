<template>
  <div class="flex gap-2 flex-grow items-center">
    <!-- name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.name"
      @click="emit('open')"
      @update:model-value="reset('name')"
    >
      Name: &nbsp;
      <span class="font-semibold"> {{ filters.name }} </span>
    </va-chip>

    <!-- project_id filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.project_id"
      @click="emit('open')"
      @update:model-value="reset('project_id')"
    >
      Project ID: &nbsp;
      <span class="font-semibold"> {{ filters.project_id }} </span>
    </va-chip>

    <!-- file_type filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.file_type"
      @click="emit('open')"
      @update:model-value="reset('file_type')"
    >
      File Type: &nbsp;
      <span class="font-semibold"> {{ filters.file_type }} </span>
    </va-chip>

    <!-- genome_type filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.genome_type"
      @click="emit('open')"
      @update:model-value="reset('genome_type')"
    >
      Genome Type: &nbsp;
      <span class="font-semibold"> {{ filters.genome_type }} </span>
    </va-chip>

    <!-- genome_value filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.genome_value"
      @click="emit('open')"
      @update:model-value="reset('genome_value')"
    >
      Genome Value: &nbsp;
      <span class="font-semibold"> {{ filters.genome_value }} </span>
    </va-chip>

    <!-- reset search -->
    <va-button
      @click="resetSearch"
      preset="secondary"
      round
      class="flex-none ml-auto"
      v-if="activeFilters.length > 0"
    >
      <span class="text-sm"> Reset </span>
    </va-button>
  </div>
</template>

<script setup>
import { useTracksStore } from "@/stores/tracks";
import { storeToRefs } from "pinia";

const store = useTracksStore();
const { filters, filterStatus, activeFilters } = storeToRefs(store);

const emit = defineEmits(["search", "open"]);

// reset a single filter
function reset(field) {
  store.resetFilterByKey(field);
  emit("search");
}

function resetSearch() {
  store.resetFilters();
  emit("search");
}
</script> 