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
  />
</template>

<script setup>
import ingestionService from "@/services/ingest";
import toast from "@/services/toast";

const props = defineProps({
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["select", "filesRetrieved"]);

const fileList = ref([]);
const loading = ref(false);
const searchText = ref("");

const onFileSelect = (file) => {
  searchText.value = file.path;
  emit("select", file);
};

const searchFiles = async (searchText) => {
  console.log("Searching for files matching:", searchText);

  if (searchText.trim() === "") {
    return;
  }

  loading.value = true;
  ingestionService
    .getPathFiles({
      path: searchText,
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

<style scoped></style>
