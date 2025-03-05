<template>
  <va-modal
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    title="Advanced File Search"
  >
    <va-inner-loading :loading="loading">
      <div class="w-full">
        <va-form class="flex flex-col gap-3 md:gap-5">
          <!-- name filter -->
          <va-input
            label="Name"
            v-model="filters.name"
            placeholder="Enter a term that matches part of the file name"
          />

          <!-- location filter -->
          <va-select
            v-model="filters.location"
            :options="locationOptions"
            text-by="text"
            value-by="value"
            label="Location"
          >
            <template #prependInner>
              <va-icon name="folder" class="my-2 mr-2" />
            </template>
          </va-select>

          <!-- file type filter -->
          <va-select
            v-model="filters.filetype"
            :options="fileTypeOptions"
            text-by="text"
            value-by="value"
            label="File Type"
          >
            <template #prependInner>
              <i-mdi:file-cog class="text-xl my-2 mr-2" />
            </template>
          </va-select>

          <!-- file extension -->
          <va-input
            label="File Extension"
            v-model="filters.extension"
            :disabled="filters.filetype === 'directory'"
            placeholder="ex: type txt to search for text files (*.txt)"
          />

          <!-- file size -->
          <div class="flex flex-col gap-3">
            <FileSizeSelect
              v-model="filters.minSize"
              label="Min Size"
              :disabled="filters.filetype === 'directory'"
            />
            <FileSizeSelect
              v-model="filters.maxSize"
              label="Max Size"
              :disabled="filters.filetype === 'directory'"
            />
          </div>
        </va-form>
      </div>
    </va-inner-loading>

    <!-- footer -->
    <template #footer>
      <div class="flex w-full gap-5">
        <va-button preset="secondary" class="flex-none" @click="hide">
          Cancel
        </va-button>
        <va-button
          preset="secondary"
          class="flex-none ml-auto"
          @click="store.resetFilters"
        >
          Reset
        </va-button>
        <va-button class="flex-none" @click="handleSearch"> Search </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import { useFileBrowserStore } from "@/stores/fileBrowser";
// import { storeToRefs } from "pinia";
// const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const emit = defineEmits(["search"]);

const store = useFileBrowserStore();
// const { filters: storeFilters } = storeToRefs(store);

const loading = ref(false);
const visible = ref(false);

// use in component state to not update the store's filter for evey keystroke
const filters = ref(store.defaultFilters());

function hide() {
  loading.value = false;
  visible.value = false;
}

function show() {
  // on modal open. set components filter values from store
  filters.value = { ...store.filters };
  visible.value = true;
}

const locationOptions = [
  {
    text: "Anywhere",
    value: "/",
  },
  {
    text: "Current Directory",
    value: "pwd",
  },
];

const fileTypeOptions = [
  {
    text: "Any",
    value: "any",
  },
  {
    text: "File",
    value: "file",
  },
  {
    text: "Directory",
    value: "directory",
  },
];

// clear extension and size when directory is selected as file type
// watch(
//   () => filters.value.filetype,
//   (newValue) => {
//     if (newValue === "directory") {
//       filters.value.extension = "";
//       filters.value.minSize = 0;
//       filters.value.maxSize = Infinity;
//     }
//   }
// );

function handleSearch() {
  // on search click, set store filters to components filters and close modal
  store.isInSearchMode = true;
  store.setFilters({ ...filters.value });
  hide();
  emit("search");
}
</script>
