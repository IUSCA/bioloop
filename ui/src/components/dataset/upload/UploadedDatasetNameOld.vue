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
    :error-messages="props.errorMessages"
    :error="props.error"
  />
</template>

<script setup>
const props = defineProps({
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
    default: false,
  },
});

const emit = defineEmits(["update:uploadedDatasetName"]);

const uploadedDatasetName = computed({
  get() {
    return props.uploadedDatasetName;
  },
  set(value) {
    emit("update:uploadedDatasetName", value);
  },
});

onMounted(() => {
  console.log("mounted");
  console.log("props.errorMessages", props.errorMessages);
  console.log("props.error", props.error);
});

watch([() => props.errorMessages, () => props.error], (newVals, oldVals) => {
  console.log("() => props.errorMessages, () => props.error");
  console.log("newVals");
  console.log(newVals[0], newVals[1]);
  console.log("oldVals");
  console.log(oldVals[0], oldVals[1]);
});
</script>

<style scoped></style>
