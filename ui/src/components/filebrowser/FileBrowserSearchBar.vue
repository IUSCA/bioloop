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
import { storeToRefs } from "pinia";

const store = useFileBrowserStore();
const { filters } = storeToRefs(store);
useSearchKeyShortcut();

const emit = defineEmits(["advancedSearch"]);

const state = computed({
  get() {
    return filters.value.name;
  },
  // debounce the user input so that state is not updated on every
  // key
  set: useDebounceFn((newValue) => {
    // console.log("setting  store.filters.name", newValue);
    filters.value.name = newValue;
    // enable search view when the search input has value
    if (newValue) store.isInSearchMode = true;
  }, 500),
});
</script>
