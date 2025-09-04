<template>
  <div class="flex gap-2 flex-grow items-center">
    <!-- definition name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.definition_name"
      @click="emit('open')"
      @update:model-value="reset('definition_name')"
    >
      Definition: &nbsp;
      <span class="font-semibold"> {{ filters.definition_name }} </span>
    </va-chip>

    <!-- program name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.program_name"
      @click="emit('open')"
      @update:model-value="reset('program_name')"
    >
      Program: &nbsp;
      <span class="font-semibold"> {{ filters.program_name }} </span>
    </va-chip>



    <!-- initiator filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.initiator"
      @click="emit('open')"
      @update:model-value="reset('initiator')"
    >
      Initiator: &nbsp;
      <span class="font-semibold"> {{ filters.initiator }} </span>
    </va-chip>

    <!-- initiated_at date filters -->
    <va-chip
      v-if="filterStatus.initiated_at"
      class="flex-none"
      closeable
      outline
      @click="emit('open')"
      @update:model-value="reset('initiated_at')"
    >
      <span class="capitalize"> Initiated at: &nbsp; </span>
      <span class="font-semibold">
        {{ datetime.date(filters.initiated_at.start) }}
        <span class="font-normal"> to </span>
        {{ datetime.date(filters.initiated_at.end) }}
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
import { useConversionStore } from "@/stores/conversion";
import { storeToRefs } from "pinia";

const store = useConversionStore();
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
