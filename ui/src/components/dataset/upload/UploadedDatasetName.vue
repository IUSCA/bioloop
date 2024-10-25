<template>
  <CopyText
    v-if="props.selectingDirectory"
    :text="uploadedDatasetName"
    :error-messages="props.errorMessages"
    :error="props.error"
  />

  <va-input
    v-else-if="props.selectingFiles"
    v-model="uploadedDatasetName"
    label="Data Product"
    :placeholder="'Dataset Product'"
    class="w-full"
  />
</template>

<script setup>
const props = defineProps({
  showUploadedDatasetProductCopyText: {
    type: Boolean,
    default: false,
  },
  uploadedDatasetName: {
    type: String,
    default: "",
  },
  selectingFiles: {
    type: Boolean,
    default: false,
  },
  selectingDirectory: {
    type: Boolean,
    default: false,
  },
  errorMessages: {
    type: Array,
    default: () => [],
  },
  error: {
    type: Boolean,
    default: null,
  },
});

const uploadedDatasetName = computed({
  get() {
    return props.uploadedDatasetName;
  },
  set(value) {},
});
</script>

<style scoped></style>
