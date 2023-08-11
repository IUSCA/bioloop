<template>
  <div class="flex gap-2">
    <va-chip class="flex-none"> Search Results </va-chip>

    <!-- name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="store.nameFilter"
      @update:model-value="store.nameFilter = ''"
    >
      Name has &nbsp;
      <span class="font-semibold"> {{ store.nameFilter }} </span>
    </va-chip>

    <!-- location filter -->
    <va-chip class="flex-none" closeable outline v-if="store.locationFilter">
      Location: {{ store.filters.location }}
    </va-chip>
  </div>
</template>

<script setup>
import { useFileBrowserStore } from "@/stores/fileBrowser";

const store = useFileBrowserStore();
// const props = defineProps({})
</script>
