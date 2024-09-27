<template>
  <!--    @update:search-text="searchFiles"-->
  <AutoComplete
    v-model:search-text="searchText"
    :placeholder="`Search directories in ${basePath}`"
    :data="props.options"
    :async="true"
    :display-by="'path'"
    @clear="fileList = []"
    @select="(file) => onFileSelect(file)"
    :disabled="disabled"
    :label="'Dataset Path'"
  >
    <va-badge
      v-if="props.basePath"
      class="base-path-badge"
      :text="basePath"
      color="secondary"
    >
    </va-badge>
  </AutoComplete>
</template>

<script setup>
import ingestionService from "@/services/ingest";
import toast from "@/services/toast";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  basePath: { type: String },
  selected: { type: String },
  searchText: { type: String, default: "" },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits([
  // "select",
  "update:selected",
  "update:searchText",
  "filesRetrieved",
  "loading",
  "loaded",
]);

const searchText = computed({
  get: () => props.searchText,
  set: (value) => {
    // searchText.value = value;
    // const _searchText = +value.path;
    console.log("emitting searchText,", value);
    emit("update:searchText", value);
  },
});

const fileList = ref([]);
const loading = ref(false);
// const searchText = ref("");
const basePath = computed(() => {
  return props.basePath.endsWith("/") ? props.basePath : props.basePath + "/";
});

const onFileSelect = (file) => {
  // const _searchText = basePath.value + value.path;
  emit("update:searchText", file);

  // searchText.value = file.path.slice(
  //   file.path.indexOf(basePath.value) + basePath.value.length,
  // );
  emit("update:selected", file);
};

const setRetrievedFiles = (files) => {
  fileList.value = files;
  console.log("retrieved file list");
  console.log(fileList.value);
  emit("filesRetrieved", fileList.value);
};

// const selectFile = (file) => {
//   console.log("Selected file:", file);
// };
</script>

<style lang="scss" scoped>
.base-path-badge {
  --va-badge-font-size: 0.8em;
  --va-badge-line-height: 1.8;
}
</style>
