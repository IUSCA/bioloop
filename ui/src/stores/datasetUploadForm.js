import { defineStore } from "pinia";

export const useDatasetUploadFormStore = defineStore(
  "datasetUploadForm",
  () => {
    const datasetName = ref("rishi");
    const fileType = ref();
    const sourceRawData = ref();

    // validates any steps upto stepIndex
    const validate = (stepIndex) => {
      let validated = true;
      for (let i = 0; i <= stepIndex; i++) {
        validated = validated && validateSteps[stepIndex];
      }
      return validated;
    };

    // Order of these validations is expected to be the same the order of the steps defined
    // in your Stepper component
    const validateSteps = [
      datasetName.value !== "",
      Object.values(fileType.value || {}).length > 0,
      Object.values(sourceRawData.value || {}) > 0,
    ];

    return {
      datasetName,
      fileType,
      sourceRawData,
      validate,
    };
  },
);
