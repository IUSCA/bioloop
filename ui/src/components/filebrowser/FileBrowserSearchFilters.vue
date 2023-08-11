<template>
  <div class="flex gap-2">
    <va-chip class="flex-none"> Search Results </va-chip>

    <!-- name filter -->
    <va-chip
      class="flex-none"
      closeable
      outline
      v-if="store.filters.name"
      @update:model-value="store.filters.name = ''"
    >
      Name has &nbsp;
      <span class="font-semibold"> {{ store.filters.name }} </span>
    </va-chip>

    <!-- location filter -->
    <va-chip class="flex-none" closeable outline v-if="store.filters.location">
      Location: {{ store.filters.location }}
    </va-chip>
  </div>
</template>

<script setup>
import { useFileBrowserStore } from "@/stores/fileBrowser";

const store = useFileBrowserStore();
// const props = defineProps({})
</script>
