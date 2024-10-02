<template>
  <va-select
    v-model="searchText"
    @update:model-value="
      (newVal) => {
        console.log('updating v-model');
        emit('update:selectedFile', newVal);
      }
    "
    v-model:search="autoCompleteSearchValue"
    @update:search="
      (newVal) => {
        console.log('searchText updated:', newVal);
        emit('update:searchText', newVal);
      }
    "
    placeholder="Search directory"
    :options="props.options"
    autocomplete
    clearable
    :track-by="'path'"
    :text-by="'path'"
    :highlight-matched-text="false"
  />
</template>

<script setup>
const props = defineProps({
  selectedFile: {
    type: Object,
  },
  options: {
    type: Array,
    default: () => [],
  },
});

const options = toRef(props, "options");

// const selectedFile = computed({
//   get: () => props.selectedFile,
//   set: (newValue) => {
//     emit("update:selectedFile", newValue);
//   },
// });

watch(options, (newVal) => {
  console.log("options updated");
  // Update autoCompleteSearchValue when options change
  console.dir(newVal, { depth: null });
});

const emit = defineEmits(["update:searchText", "update:selectedFile"]);

const searchText = ref("");
const autoCompleteSearchValue = ref("");
</script>

<style scoped></style>
