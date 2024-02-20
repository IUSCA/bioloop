<template>
  <AutoComplete
    ref="fileListAutoComplete"
    v-model="searchText"
    @update:model-value="(path) => loadFileList(path)"
    :async="true"
    @open="loadFileList"
    @close="resetFileList"
    placeholder="Enter Directory Path"
    :data="filesInPath"
    :display-by="(item) => item.path"
    :error-message="error ? 'Please select a directory' : ''"
  />
</template>

<script setup>
import dataImport from "@/services/dataImport";
import dataImportService from "@/services/dataImport";
import toast from "@/services/toast";

const loading = ref(true);
const filesInPath = ref([]);
const searchText = ref("");
// const noFileSelected = ref(false);
const fileListAutoComplete = ref(null);
const error = computed(
  () => fileListAutoComplete.value?.hasSelectedResult === false,
);

const loadFileList = (path) => {
  loading.value = true;
  dataImportService
    .listDir(path)
    .then((res) => {
      const mockResponse = mockResults(path);
      filesInPath.value = mockResponse.data;
    })
    .catch(() => {
      toast.error("Could not retrieve directory's contents");
    })
    .finally(() => {
      loading.value = false;
    });
};

const resetFileList = () => {
  filesInPath.value = [];
};

const mockResults = (path) => {
  const mock = (path, index) =>
    path ? `${path}_${index}` : `base_file_${index}`;

  return {
    data: [
      {
        name: mock(path, 1),
        isDir: false,
        path: `/path/to/${mock(path, 1)}`,
      },
      {
        name: mock(path, 2),
        isDir: false,
        path: `/path/to/${mock(path, 2)}`,
      },
      {
        name: mock(path, 3),
        isDir: true,
        path: `/path/to/${mock(path, 3)}`,
      },
    ],
  };
};

// onMounted(() => {
//   loadFileList();
// });
</script>

<style scoped></style>
