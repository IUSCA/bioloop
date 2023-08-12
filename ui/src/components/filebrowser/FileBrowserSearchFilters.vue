<template>
  <div class="flex gap-2 w-full items-center">
    <va-chip class="flex-none"> Search Results </va-chip>

    <!-- name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      size="small"
      v-if="filters.name"
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
      size="small"
      v-if="filters.location !== '/'"
      @update:model-value="reset('location')"
    >
      Location: {{ store.pwd }}
    </va-chip>

    <!-- filetype filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      size="small"
      v-if="filters.filetype !== 'any'"
      @update:model-value="reset('filetype')"
    >
      Type: {{ filters.filetype }}
    </va-chip>

    <!-- extension filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      size="small"
      v-if="filters.extension"
      @update:model-value="reset('extension')"
    >
      Extension: {{ filters.extension }}
    </va-chip>

    <!-- min size filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      size="small"
      v-if="filters.minSize"
      @update:model-value="reset('minSize')"
    >
      Size &gt; {{ formatBytes(filters.minSize) }}
    </va-chip>

    <!-- max size filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      size="small"
      v-if="filters.maxSize && isFinite(filters.maxSize)"
      @update:model-value="reset('maxSize')"
    >
      Size &lt; {{ formatBytes(filters.maxSize) }}
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
// import { toValue } from "vue";

const store = useFileBrowserStore();
const { filters } = storeToRefs(store);
// const props = defineProps({})

const emit = defineEmits(["search"]);

// reset all filters and close search view
function closeSearch() {
  store.resetFilters();
  store.isInSearchMode = false;
}

// reset a single filter
function reset(field) {
  console.log("reset", field);
  store.reset(field);
  emit("search");
}

// monitor if all filters are cleared and display back button
// const noFilters = ref(false);
// const filtersRefs = Object.values(toRefs(store.filters));
// const defaults = Object.values(store.defaultFilters());
// watch(filtersRefs, () => {
//   const filterValues = filtersRefs.map((x) => toValue(x));
//   noFilters.value = arrayEquals(filterValues, defaults);
// });
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
