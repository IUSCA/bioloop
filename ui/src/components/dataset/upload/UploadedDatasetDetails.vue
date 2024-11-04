<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr v-if="sourceRawData">
          <td>Source Raw Data</td>
          <td class="source-raw-data-name">
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

        <tr>
          <td>Status</td>
          <td>
            <va-chip size="small" :color="props.statusChipColor">
              {{ props.submissionStatus }}
            </va-chip>
          </td>
        </tr>

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
  <!--    </va-card-content>-->
  <!--  </va-card>-->
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
    required: true,
  },
  submissionStatus: {
    type: String,
    required: true,
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
onMounted(() => {
  console.log("details component mounted");
  console.log("props.datasetName");
  console.dir(props.datasetName);
  console.log("props.datasetNameInput");
  console.dir(props.datasetNameInput);
});

watch(
  () => props.datasetName,
  () => {
    console.log("details component watch");
    console.log("props.datasetName");
    console.dir(props.datasetName);
    console.log("props.datasetNameInput");
    console.dir(props.datasetNameInput);
  },
);
</script>

<style scoped>
.source-raw-data-name {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
}
</style>
