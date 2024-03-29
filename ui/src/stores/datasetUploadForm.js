import { defineStore } from "pinia";

export const useDatasetUploadFormStore = defineStore(
  "datasetUploadForm",
  () => {
    const datasetName = ref("rishi");
    const fileType = ref();
    const sourceRawData = ref();

    const validate = () => {};

    return {
      datasetName,
      fileType,
      sourceRawData,
      validate,
    };
  },
);
