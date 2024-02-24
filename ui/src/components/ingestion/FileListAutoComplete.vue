<template>
  <AutoComplete
    ref="fileListAutoComplete"
    :async="true"
    :show-selected-result="true"
    v-model:search-text="searchText"
    @update:search-text="(path) => loadFileList(path)"
    @open="loadFileList"
    @close="resetFileList"
    @select="handleSelect"
    placeholder="Enter Directory Path"
    :data="filesInPath"
    :display-by="displayBy"
    :error-message="error ? 'Please select a directory' : ''"
    label="Directory"
  />
</template>

<script setup>
import dataImport from "@/services/dataImport";
import dataImportService from "@/services/dataImport";
import toast from "@/services/toast";

const props = defineProps({
  selected: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:selected"]);

const handleSelect = (selectedItem) => emit("update:selected", selectedItem);

const displayBy = (item) => {
  // console.log(`FileListAutoComplete, displayBy(): BEGIN`);
  // console.log(`item`);
  // console.log(item);
  // console.log(`FileListAutoComplete, displayBy(): END`);

  return item.path;
};

const loading = ref(true);
const filesInPath = ref([]);

const searchText = ref("");
watchEffect(() => (searchText.value = props.selected.path));

// watch(searchText, () => {
//   console.log(`FileListAutoComplete, watch(): BEGIN: searchText changed`);
//   console.log(`searchText`);
//   console.log(searchText.value);
// });

const fileListAutoComplete = ref(null);
const error = computed(
  () => fileListAutoComplete.value?.hasSelectedResult === false,
);

const loadFileList = (path) => {
  // console.log(`FileListAutoComplete, loadFileList(): BEGIN`);
  loading.value = true;
  dataImportService
    .listDir(path)
    .then((res) => {
      // console.log(`FileListAutoComplete, loadFileList(): RETRIEVED`);
      filesInPath.value = res.data;
    })
    .catch(() => {
      // console.log(`FileListAutoComplete, loadFileList(): ERROR`);
      toast.error("Could not retrieve directory's contents");
    })
    .finally(() => {
      loading.value = false;
      // console.log(`FileListAutoComplete, loadFileList(): END`);
    });
};

const resetFileList = () => {
  // console.log(`FileListAutoComplete, resetFileList(): BEGIN`);
  filesInPath.value = [];
  // console.log(`FileListAutoComplete, resetFileList(): END`);
};
</script>
