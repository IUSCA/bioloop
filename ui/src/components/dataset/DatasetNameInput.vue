<template>
  <va-input
    v-model="datasetNameInput"
    :placeholder="'Dataset name'"
    class="w-full"
    :messages="props.error ? [props.error] : ['Name of the uploaded dataset']"
    :disabled="props.inputDisabled"
  />
  <!-- Only one of error and hint are shown at a time -->
  <div class="va-text-danger text-sm" v-if="props.error">
    {{ props.error }}
  </div>
</template>

<script setup>
const props = defineProps({
  populatedDatasetName: {
    type: String,
    default: "",
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
  error: {
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
