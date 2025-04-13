<template>
  <va-input
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
  // datasetName: {
  //   type: String,
  //   default: "",
  // },
  // datasetNameInput: {
  //   type: String,
  //   default: "",
  // },
  populatedDatasetName: {
    type: String,
    default: "",
  },
  inputDisabled: {
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

const emit = defineEmits(["update:populatedDatasetName"]);

const datasetNameInput = computed({
  get() {
    return props.populatedDatasetName;
  },
  set(value) {
    emit("update:populatedDatasetName", value);
  },
});
</script>
