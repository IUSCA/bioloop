<!--todo - input file name is never visible-->

<!--todo - other usages of copytext  -->

<template>
  <!--  datasetNameErrorMessages - {{ datasetNameErrorMessages }}, datasetNameError - -->
  <!--  {{ datasetNameError }}-->

  <CopyText v-if="props.selectingDirectory" v-model:text="datasetName" />

  <!--  <SomeComponent />-->

  <va-input
    v-else-if="props.selectingFiles"
    v-model="datasetNameInput"
    :placeholder="'Dataset name'"
    class="w-full"
    :messages="'Name for the uploaded dataset'"
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

// const emitDatasetNameUpdate = (text) => {
//   emit("update:datasetName", text);
// };

const datasetNameInput = computed({
  get() {
    return props.datasetNameInput;
  },
  set(value) {
    emit("update:datasetNameInput", value);
  },
});

const datasetName = computed({
  get() {
    return props.datasetName;
  },
  set(value) {
    emit("update:datasetName", value);
  },
});

// const datasetNameErrorMessages = computed(() => {
//   return [props.datasetNameErrorMessages];
// });

// const errorMessages = computed({
//   get() {
//     return props.datasetNameErrorMessages;
//   },
//   set(value) {},
// });

//   console.log("props.isSelectingFiles", props.selectingFiles);
//   console.log("props.isSelectingDirectory", props.selectingDirectory);
// });
//
// watch([() => props.selectingFiles, () => props.selectingDirectory], () => {
//   console.log("watch");
//   console.log("props.isSelectingFiles", props.selectingFiles);
//   console.log("props.isSelectingDirectory", props.selectingDirectory);
// });

onMounted(() => {
  console.log("name component mounted");
  console.log("props.datasetName");
  console.dir(props.datasetName);
  console.log("props.datasetNameInput");
  console.dir(props.datasetNameInput);
});

watch(
  () => props.datasetName,
  () => {
    console.log("name component watch");
    console.log("props.datasetName");
    console.dir(props.datasetName);
    console.log("props.datasetNameInput");
    console.dir(props.datasetNameInput);
  },
);

// watch(
//   [() => props.datasetNameErrorMessages, () => props.datasetNameError],
//   (newVals, oldVals) => {
//     console.log(
//       "    () => props.datasetNameErrorMessages,\n" +
//         "    () => props.datasetNameError,\n",
//     );
//     console.log("oldVals");
//     console.log(oldVals[0], oldVals[1]);
//     console.log("newVals");
//     console.log(newVals[0], newVals[1]);
//   },
// );
</script>

<style scoped></style>
