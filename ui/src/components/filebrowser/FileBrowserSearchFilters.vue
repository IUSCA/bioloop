<template>
  <div class="flex gap-2 w-full items-center">
    <va-chip class="flex-none"> Search Results </va-chip>

    <!-- name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.name"
      @update:model-value="reset('name')"
    >
      Name has &nbsp;
      <span class="font-semibold"> {{ filters.name }} </span>
    </va-chip>

    <!-- location filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.location"
      @update:model-value="reset('location')"
    >
      Location: &nbsp;
      <span class="font-semibold"> {{ store.pwd || "/" }} </span>
    </va-chip>

    <!-- filetype filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.filetype"
      @update:model-value="reset('filetype')"
    >
      Type: &nbsp;
      <span class="font-semibold"> {{ filters.filetype }} </span>
    </va-chip>

    <!-- extension filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.extension"
      @update:model-value="reset('extension')"
    >
      Extension: &nbsp;
      <span class="font-semibold"> {{ filters.extension }} </span>
    </va-chip>

    <!-- min size filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.minSize"
      @update:model-value="reset('minSize')"
    >
      Size &gt; &nbsp;
      <span class="font-semibold"> {{ formatBytes(filters.minSize) }} </span>
    </va-chip>

    <!-- max size filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="filterStatus.maxSize"
      @update:model-value="reset('maxSize')"
    >
      Size &lt; &nbsp;
      <span class="font-semibold"> {{ formatBytes(filters.maxSize) }} </span>
    </va-chip>

    <!-- close search -->
    <va-button
      @click="closeSearch"
      preset="secondary"
      round
      class="flex-none ml-auto"
    >
      <span class="text-sm"> Close Search </span>
    </va-button>
  </div>
</template>

<script setup>
import { useFileBrowserStore } from "@/stores/fileBrowser";
import { storeToRefs } from "pinia";
import { formatBytes } from "@/services/utils";

const store = useFileBrowserStore();
const { filters, filterStatus } = storeToRefs(store);
// const props = defineProps({})

const emit = defineEmits(["search"]);

// reset all filters and close search view
function closeSearch() {
  store.resetFilters();
  store.isInSearchMode = false;
}

// reset a single filter
function reset(field) {
  store.resetByKey(field);
  emit("search");
}
</script>

<style>
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
