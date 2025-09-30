<template>
  <va-input
    v-model="datasetNameInput"
    :placeholder="'Dataset name'"
    class="w-full"
    :disabled="props.inputDisabled"
    :data-testid="props.dataTestId"
  />
  <!-- Only one of error and hint are shown at a time -->
  <div class="va-text-danger text-xs dataset-name-input" v-if="props.error">
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
  dataTestId: {
    type: String,
    default: "dataset-name-input",
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

// const hintsState = computed(() => {
//   let ret = props.error
//     ? {
//         error: true,
//         errorMessages: props.error,
//       }
//     : {
//         messages: "Name of the uploaded dataset",
//       };
//   console.log("hintsState:", ret);
//   return ret;
// });
//
// onMounted(() => {
//   console.log("Mounted DatasetNameInput");
//   console.log("props.error:", props.error);
// });
</script>

<style scoped>
.dataset-name-input {
  font-size: 13px;
}
</style>
