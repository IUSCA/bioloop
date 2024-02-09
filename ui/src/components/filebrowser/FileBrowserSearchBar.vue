<template>
  <va-input
    v-model="state"
    class="w-full"
    placeholder="Type / to begin search"
    outline
    clearable
    input-class="search-input"
  >
    <template #prependInner>
      <Icon icon="material-symbols:search" class="text-xl" />
    </template>
    <template #appendInner>
      <va-button preset="secondary" round @click="emit('advancedSearch')">
        <Icon icon="mdi:tune" class="text-xl" />
        <span class="sr-only">Advanced Search</span>
      </va-button>
    </template>
  </va-input>
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import { useFileBrowserStore } from "@/stores/fileBrowser";

const store = useFileBrowserStore();
useSearchKeyShortcut();

const emit = defineEmits(["advancedSearch"]);

const state = computed({
  get() {
    return store.filters.name;
  },
  set(newValue) {
    // console.log("setting  store.filters.name", newValue);
    store.filters.name = newValue;
    // enable search view when the search input has value
    if (newValue) store.isInSearchMode = true;
  },
});
</script>
