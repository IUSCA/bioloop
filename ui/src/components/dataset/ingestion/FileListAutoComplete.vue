<template>
  <AutoComplete
    v-model:search-text="searchText"
    @update:search-text="searchFiles"
    placeholder="Search directories by path"
    :data="fileList"
    :async="true"
    :display-by="'path'"
    @clear="fileList = []"
    @select="(file) => onFileSelect(file)"
    :disabled="disabled"
    :label="'Dataset Path'"
  >
    <va-badge class="base-path-badge" :text="basePath"> </va-badge>
  </AutoComplete>
</template>

<script setup>
import ingestionService from "@/services/ingest";
import toast from "@/services/toast";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  basePath: { type: String },
});

const emit = defineEmits(["select", "filesRetrieved"]);

const fileList = ref([]);
const loading = ref(false);
const searchText = ref("");
const basePath = computed(() => props.basePath + "/");

const onFileSelect = (file) => {
  searchText.value = file.path;
  emit("select", file);
};

const searchFiles = async (searchText) => {
  console.log("Searching for files matching:", searchText);

  const _searchText = basePath.value + searchText;

  if (_searchText.trim() === "") {
    return;
  }

  loading.value = true;
  ingestionService
    .getPathFiles({
      path: _searchText,
    })
    .then((response) => {
      fileList.value = response.data;
      console.log("retrieved file list");
      console.log(fileList.value);
      emit("filesRetrieved", fileList.value);
    })
    .catch((error) => {
      toast.error("Error fetching files from the provided path");
      console.error(error);
    })
    .finally(() => {
      loading.value = false;
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
