import { defineStore } from "pinia";

export const useDatasetUploadFormStore = defineStore(
  "datasetUploadForm",
  () => {
    const datasetName = ref("");
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

    const evaluateErrors = (stepIndex) => {
      const errors = [
        {
          datasetName: !isDatasetNameValid.value
            ? "Dataset name is required"
            : undefined,
        },
        {
          fileType: !isFileTypeValid.value
            ? "File Type is required"
            : undefined,
        },
        {
          sourceRawData: !isSourceRawDataValid.value
            ? "Source dataset is required"
            : undefined,
        },
      ];
      const slicedErrors = stepIndex ? errors.slice(0, stepIndex + 1) : errors;

      return Object.assign({}, ...slicedErrors);

      // return errors.slice(0, stepIndex + 1);
    };

    // validates any steps upto stepIndex
    const isValid = (stepIndex) => {
      console.log("store: validating step: " + stepIndex);
      let _stepIndex =
        !stepIndex && stepIndex !== 0
          ? stepValidations.value.length - 1
          : stepIndex;

      let isValid = true;
      for (let i = 0; i <= _stepIndex; i++) {
        isValid = isValid && stepValidations.value[i];
      }

      console.log("store: validated: ", isValid);
      return isValid;
    };

    return {
      datasetName,
      fileType,
      sourceRawData,
      isValid,
      evaluateErrors,
    };
  },
);
