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

    <!-- deleted filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.deleted"
      @click="emit('open')"
      @update:model-value="reset('deleted')"
    >
      Deleted
    </va-chip>

    <!-- three state filters -->
    <va-chip
      v-for="fkey in ['archived', 'staged'].filter((k) => filterStatus[k])"
      :key="fkey"
      class="flex-none"
      closeable
      outline
      @click="emit('open')"
      @update:model-value="reset(fkey)"
    >
      <span class="capitalize">
        {{ filters[fkey] ? "" : "Not" }} {{ fkey }}
      </span>
    </va-chip>

    <!-- has_workflows filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.has_workflows"
      @click="emit('open')"
      @update:model-value="reset('has_workflows')"
    >
      <span>
        {{ filters.has_workflows ? "With workflows" : "Without workflows" }}
      </span>
    </va-chip>

    <!-- has_derived_data filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.has_derived_data"
      @click="emit('open')"
      @update:model-value="reset('has_derived_data')"
    >
      <span>
        {{
          filters.has_derived_data
            ? "With derived data"
            : "Without derived data"
        }}
      </span>
    </va-chip>

    <!-- has_source_data filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.has_source_data"
      @click="emit('open')"
      @update:model-value="reset('has_source_data')"
    >
      <span>
        {{
          filters.has_source_data ? "With source data" : "Without source data"
        }}
      </span>
    </va-chip>

    <!-- created_at and updated_at date filters -->
    <va-chip
      v-for="fkey in ['created_at', 'updated_at'].filter(
        (k) => filterStatus[k],
      )"
      :key="fkey"
      class="flex-none"
      closeable
      outline
      @click="emit('open')"
      @update:model-value="reset(fkey)"
    >
      <span class="capitalize"> {{ fkey.split("_").join(" ") }}: &nbsp; </span>
      <span class="font-semibold">
        {{ datetime.date(filters[fkey].start) }}
        <span class="font-normal"> to </span>
        {{ datetime.date(filters[fkey].end) }}
      </span>
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
import * as datetime from "@/services/datetime";
import { useDatasetStore } from "@/stores/dataset";
import { storeToRefs } from "pinia";

const store = useDatasetStore();
const { filters, filterStatus, activeFilters } = storeToRefs(store);
// const props = defineProps({})

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
