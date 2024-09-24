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

// const selectedFile = computed({
//   get: () => props.selectedFile,
//   set: (newValue) => {
//     emit("update:selectedFile", newValue);
//   },
// });

const emit = defineEmits(["update:searchText", "update:selectedFile"]);

const searchText = ref("");
const autoCompleteSearchValue = ref("");
</script>

<style scoped></style>
