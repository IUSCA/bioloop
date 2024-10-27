<!--todo - input file name is never visible-->
<template>
  <CopyText
    v-if="props.selectingDirectory"
    :text="props.datasetName"
    :error-messages="[props.datasetNameErrorMessages]"
    :error="props.datasetNameError"
  />
  <!--v-modal blank-->
  <va-input
    v-else-if="props.selectingFiles"
    v-model="datasetNameInput"
    :placeholder="'Dataset name'"
    class="w-full"
    :error="props.datasetNameError"
    :error-messages="[props.datasetNameErrorMessages]"
    :messages="'Please select a name for the uploaded dataset.'"
  />
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

const emit = defineEmits(["update:datasetNameInput"]);

const datasetNameInput = computed({
  get() {
    return props.datasetNameInput;
  },
  set(value) {
    emit("update:datasetNameInput", value);
  },
});

// const errorMessages = computed({
//   get() {
//     return props.datasetNameErrorMessages;
//   },
//   set(value) {},
// });

onMounted(() => {
  console.log("mounted");
  console.log("props.isSelectingFiles", props.selectingFiles);
  console.log("props.isSelectingDirectory", props.selectingDirectory);
});

watch([() => props.selectingFiles, () => props.selectingDirectory], () => {
  console.log("watch");
  console.log("props.isSelectingFiles", props.selectingFiles);
  console.log("props.isSelectingDirectory", props.selectingDirectory);
});
</script>

<style scoped></style>
