<template>
  <va-input
    v-model="state"
    class="w-full"
    placeholder="Type / to begin search"
    outline
    clearable
    input-class="search-input"
    @keydown="handleChange"
  >
    <template #prependInner>
      <Icon icon="material-symbols:search" class="text-xl" />
    </template>
    <template #appendInner>
      <va-button preset="secondary" round @click="openModal">
        <Icon icon="mdi:tune" class="text-xl" />
      </va-button>
    </template>
  </va-input>

  <FileBrowserSearchModal ref="advancedSearchModal" />
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import { useFileBrowserStore } from "@/stores/fileBrowser";

const store = useFileBrowserStore();
useSearchKeyShortcut();

const state = computed({
  get() {
    return store.filters.name;
  },
  set(newValue) {
    store.filters.name = newValue;
    // enable search view when the search input has value
    // disable search view when the searh input is cleared
    store.isInSearchMode = !!store.filters.name;
  },
});

const advancedSearchModal = ref(null);

function openModal() {
  advancedSearchModal.value.show();
}
</script>
