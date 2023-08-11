<template>
  <va-input
    v-model="store.nameFilter"
    class="w-full"
    placeholder="Search everywhere"
    outline
    clearable
  >
    <template #prependInner>
      <Icon icon="material-symbols:search" class="text-xl" />
    </template>
    <template #appendInner>
      <va-button preset="secondary" round>
        <Icon icon="mdi:tune" class="text-xl" />
      </va-button>
    </template>
  </va-input>
</template>

<script setup>
import { useFileBrowserStore } from "@/stores/fileBrowser";

const store = useFileBrowserStore();
</script>
