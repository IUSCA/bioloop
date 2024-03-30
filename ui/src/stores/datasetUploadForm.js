import { defineStore } from "pinia";

export const useDatasetUploadFormStore = defineStore(
  "datasetUploadForm",
  () => {
    const datasetName = ref("rishi");
    const fileType = ref();
    const sourceRawData = ref();

    const isDatasetNameValid = computed(() => datasetName.value !== "");
    const isFileTypeValid = computed(
      () => Object.values(fileType.value || {}).length > 0,
    );
    const isSourceRawDataValid = computed(
      () => Object.values(sourceRawData.value || {}).length > 0,
    );

    // Order of these validations is expected to be the same the order of the steps defined
    // in your Stepper component
    const stepValidations = computed(() => [
      isDatasetNameValid.value,
      isFileTypeValid.value,
      isSourceRawDataValid.value,
    ]);

    const errors = computed(() => {
      return {
        datasetName: !isDatasetNameValid.value
          ? "Dataset name is required"
          : undefined,
        fileType: !isFileTypeValid.value ? "File Type is required" : undefined,
        sourceRawData: !isSourceRawDataValid.value
          ? "Source dataset is required"
          : undefined,
      };
    });

    // validates any steps upto stepIndex
    const validate = (stepIndex) => {
      console.log("store: validating step: " + stepIndex);
      let _stepIndex =
        !stepIndex && stepIndex !== 0
          ? stepValidations.value.length - 1
          : stepIndex;

      let validated = true;
      for (let i = 0; i <= _stepIndex; i++) {
        validated = validated && stepValidations.value[i];
      }

      console.log("store: validated: ", validated);
      return validated;
    };

    return {
      datasetName,
      fileType,
      sourceRawData,
      validate,
      errors,
    };
  },
);
