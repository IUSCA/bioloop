<template>
  <AutoComplete
    v-model:search-text="searchText"
    @update:search-text="searchFiles"
    :placeholder="`Search directories in ${basePath}`"
    :data="fileList"
    :async="true"
    :display-by="'path'"
    @clear="fileList = []"
    @select="(file) => onFileSelect(file)"
    :disabled="disabled"
    :label="'Dataset Path'"
  >
    <va-badge class="base-path-badge" :text="basePath" color="secondary">
    </va-badge>
  </AutoComplete>
</template>

<script setup>
import ingestionService from "@/services/ingest";
import toast from "@/services/toast";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  basePath: { type: String },
});

const emit = defineEmits(["select", "filesRetrieved", "loading", "loaded"]);

const fileList = ref([]);
const loading = ref(false);
const searchText = ref("");
const basePath = computed(() => props.basePath + "/");

const onFileSelect = (file) => {
  searchText.value = file.path.slice(
    file.path.indexOf(basePath.value) + basePath.value.length,
  );
  emit("select", file);
};

const setRetrievedFiles = (files) => {
  fileList.value = files;
  console.log("retrieved file list");
  console.log(fileList.value);
  emit("filesRetrieved", fileList.value);
};

const searchFiles = async (searchText) => {
  console.log("Searching for files matching:", searchText);

  const _searchText = basePath.value + searchText;

  if (_searchText.trim() === "") {
    return;
  }

  loading.value = true;
  emit("loading", loading.value);

  ingestionService
    .getPathFiles({
      path: _searchText,
    })
    .then((response) => {
      setRetrievedFiles(response.data);
    })
    .catch((err) => {
      console.log(err.response.status);
      console.error(err);
      if (err.response.status === 403) {
        setRetrievedFiles([]);
      } else {
        toast.error("Error fetching files");
      }
    })
    .finally(() => {
      loading.value = false;
      emit("loaded", loading.value);
    });
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
