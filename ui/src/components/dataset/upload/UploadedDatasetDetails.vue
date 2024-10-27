<template>
  <va-card class="mt-5">
    <va-card-title>
      <div class="flex flex-nowrap items-center w-full">
        <span class="text-lg">Details</span>
      </div>
    </va-card-title>
    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table">
          <tbody>
            <tr v-if="sourceRawData">
              <td>Source Raw Data</td>
              <td>
                <span>
                  <router-link
                    :to="`/datasets/${sourceRawData?.id}`"
                    target="_blank"
                  >
                    {{ sourceRawData?.name }}
                  </router-link>
                </span>
              </td>
            </tr>

            <!--            <tr>-->
            <!--              <td>Status</td>-->
            <!--              <td>-->
            <!--                <va-chip size="small" :color="props.statusChipColor">-->
            <!--                  {{ props.submissionStatus }}-->
            <!--                </va-chip>-->
            <!--              </td>-->
            <!--            </tr>-->

            <tr v-if="props.selectingFiles || props.selectingDirectory">
              <td>Data Product</td>
              <td>
                <UploadedDatasetName
                  v-model:dataset-name-input="datasetNameInput"
                  v-model:dataset-name="datasetName"
                  :dataset-name-error="props.uploadedDataProductError"
                  :dataset-name-error-messages="
                    props.uploadedDataProductErrorMessages
                  "
                  :selecting-files="props.selectingFiles"
                  :selecting-directory="props.selectingDirectory"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
const props = defineProps({
  datasetName: {
    type: String,
    default: "",
  },
  datasetNameInput: {
    type: String,
    required: true,
  },
  selectingFiles: {
    type: Boolean,
    required: true,
  },
  selectingDirectory: {
    type: Boolean,
    required: true,
  },
  uploadedDataProductErrorMessages: {
    type: String,
    default: "",
  },
  uploadedDataProductError: {
    type: Boolean,
    default: false,
  },
  statusChipColor: {
    type: String,
    default: "success",
  },
  sourceRawData: {
    type: Array,
    default: () => [],
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

const datasetName = computed({
  get() {
    return props.datasetName;
  },
  set(value) {
    emit("update:datasetName", value);
  },
});

const sourceRawData = computed(() => props.sourceRawData[0]);

// watch(
//   () => props.sourceRawData,
//   () => {
//     console.log("Source Raw Data Changed");
//     console.dir(props.sourceRawData, { depth: null });
//   },
// );
//
// onMounted(() => {
//   console.log("details component mounted");
//   console.dir(props.sourceRawData, { depth: null });
// });

watch(
  [
    () => props.uploadedDataProductErrorMessages,
    () => props.uploadedDataProductError,
  ],
  (newVals, oldVals) => {
    console.log(
      "    () => props.uploadedDataProductErrorMessages,\n" +
        "    () => props.uploadedDataProductError,\n",
    );
    console.log("oldVals");
    console.log(oldVals[0], oldVals[1]);
    console.log("newVals");
    console.log(newVals[0], newVals[1]);
  },
);
</script>

<style scoped></style>
