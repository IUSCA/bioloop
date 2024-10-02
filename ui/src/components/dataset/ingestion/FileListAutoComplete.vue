<template>
  <AutoComplete
    placeholder="Search directories"
    :data="fileList"
    :async="true"
    @update:search-text="searchFiles"
    :display-by="'path'"
    @clear="fileList = []"
    @select="(file) => emit('select', file)"
  />
</template>

<script setup>
import ingestionService from "@/services/ingest";
import toast from "@/services/toast";

const emit = defineEmits(["select", "filesRetrieved"]);

const fileList = ref([]);
const loading = ref(false);

const searchFiles = async (searchText) => {
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
