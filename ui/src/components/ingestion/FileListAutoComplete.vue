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
    :display-by="displayBy"
    :error-message="error ? 'Please select a directory' : ''"
  />
</template>

<script setup>
import dataImport from "@/services/dataImport";
import dataImportService from "@/services/dataImport";
import toast from "@/services/toast";

const displayBy = (item) => {
  console.log(`FileListAutoComplete, displayBy(): BEGIN`);
  console.log(`item`);
  console.log(item);
  console.log(`FileListAutoComplete, displayBy(): END`);

  return item.path;
};

const loading = ref(true);
const filesInPath = ref([]);
const searchText = ref("");
// const noFileSelected = ref(false);
const fileListAutoComplete = ref(null);
const error = computed(
  () => fileListAutoComplete.value?.hasSelectedResult === false,
);

const loadFileList = (path) => {
  console.log(`FileListAutoComplete, loadFileList(): BEGIN`);
  loading.value = true;
  dataImportService
    .listDir(path)
    .then((res) => {
      console.log(`FileListAutoComplete, loadFileList(): RETRIEVED`);
      const mockResponse = mockResults(path);
      filesInPath.value = mockResponse.data;
    })
    .catch(() => {
      console.log(`FileListAutoComplete, loadFileList(): ERROR`);
      toast.error("Could not retrieve directory's contents");
    })
    .finally(() => {
      loading.value = false;
      console.log(`FileListAutoComplete, loadFileList(): END`);
    });
};

const resetFileList = () => {
  console.log(`FileListAutoComplete, resetFileList(): BEGIN`);
  filesInPath.value = [];
  console.log(`FileListAutoComplete, resetFileList(): END`);
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
      // {
      //   name: mock(path, 2),
      //   isDir: false,
      //   path: `/path/to/${mock(path, 2)}`,
      // },
      // {
      //   name: mock(path, 3),
      //   isDir: true,
      //   path: `/path/to/${mock(path, 3)}`,
      // },
    ],
  };
};

// onMounted(() => {
//   loadFileList();
// });
</script>
