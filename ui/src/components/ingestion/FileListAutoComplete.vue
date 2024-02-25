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
    :error="!!requiredError"
    :error-messages="requiredError"
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
  required: {
    type: Boolean,
    default: false,
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
watchEffect(() => (searchText.value = props.selected.path || ""));

const requiredError = ref("");

const handleInput = () => {
  // console.log(`FileListAutoComplete, handleClear - BEGIN`);

  // console.log(`searchText.value`);
  // console.log(searchText.value);

  requiredError.value =
    searchText.value === "" && props.required
      ? "Please select a directory"
      : "";

  // console.log(`requiredError.value`);
  // console.log(requiredError.value);

  if (searchText.value === "") {
    emit("update:selected", {});
    // console.log(`emitted 'update:selected'`);
  }
  // console.log(`FileListAutoComplete, handleClear - END`);
};

watch(searchText, () => {
  // console.log(`FileListAutoComplete, searchText WATCH - BEGIN`);
  handleInput();
  // console.log(`FileListAutoComplete, searchText WATCH - END`);
});

// watch(searchFileListAutoComplete, searchText WATCH - END => {
//   console.log(`FileListAutoComplete, watch(): BEGIN: searchText changed`);
//   console.log(`searchText`);
//   console.log(searchText.value);
// });

const fileListAutoComplete = ref(null);

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
