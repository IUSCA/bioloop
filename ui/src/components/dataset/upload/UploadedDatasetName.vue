<template>
  <CopyText v-if="props.selectingDirectory" :text="props.datasetName" />

  <va-input
    v-else-if="props.selectingFiles"
    v-model="datasetNameInput"
    :placeholder="'Dataset name'"
    class="w-full"
    :messages="'Name for the uploaded dataset'"
    :disabled="props.inputDisabled"
  />

  <div class="va-text-danger text-xs" v-if="props.datasetNameError">
    {{ props.datasetNameErrorMessages }}
  </div>
</template>

<script setup>
const props = defineProps({
  datasetName: {
    type: String,
    default: "",
  },
  datasetNameInput: {
    type: String,
    default: "",
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
  selectingFiles: {
    type: Boolean,
    default: false,
  },
  selectingDirectory: {
    type: Boolean,
    default: false,
  },
  datasetNameError: {
    type: Boolean,
    default: false,
  },
  datasetNameErrorMessages: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:datasetNameInput", "update:datasetName"]);

const datasetNameInput = computed({
  get() {
    return props.datasetNameInput;
  },
  set(value) {
    emit("update:datasetNameInput", value);
  },
});
</script>
