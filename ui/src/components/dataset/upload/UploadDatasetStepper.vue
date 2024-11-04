<template>
  <va-inner-loading :loading="loading" class="h-full">
    <!--    <va-form ref="datasetUploadForm">-->
    <va-stepper
      v-model="step"
      :steps="steps"
      controlsHidden
      class="h-full create-data-product-stepper"
    >
      <!-- Step icons and labels -->
      <template
        v-for="(s, i) in steps"
        :key="s.label"
        #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
      >
        <va-button
          class="step-button p-1 sm:p-3 cursor-pointer"
          :class="{
            'step-button--active': isActive,
            'step-button--completed': isCompleted,
          }"
          @click="setStep(i)"
          :disabled="
            submitAttempted || submissionSuccess || step < i || loading
          "
          preset="secondary"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="s.icon" />
            <span class="hidden sm:block"> {{ s.label }} </span>
          </div>
        </va-button>
      </template>

      <template #step-content-0>
        <div class="flex flex-col gap-10">
          <va-checkbox
            v-model="isAssignedSourceRawData"
            @update:modelValue="
              (val) => {
                if (!val) {
                  rawDataSelected = [];
                }
              }
            "
            color="primary"
            label="Assign source Raw Data"
          />

          <va-form-field
            v-if="isAssignedSourceRawData"
            v-model="rawDataSelected"
            v-slot="{ value: v }"
          >
            <DatasetSelect
              :selected-results="v.ref"
              @select="addDataset"
              @remove="removeDataset"
              select-mode="single"
              :dataset-type="config.dataset.types.RAW_DATA.key"
              :show-error="!stepIsPristine"
              :error="formErrors[STEP_KEYS.RAW_DATA]"
              placeholder="Search Raw Data"
              selected-label="Selected source Raw Data"
              :messages="['Select a Source Raw Data']"
            ></DatasetSelect>
          </va-form-field>
        </div>
      </template>

      <template #step-content-1>
        <div class="flex flex-col">
          <SelectFileButtons
            :submit-attempted="submitAttempted"
            @files-added="
              (files) => {
                clearSelectedDirectoryToUpload();
                setFiles(files);
                isSubmissionAlertVisible = false;
                setUploadedFileType(FILE_TYPE.FILE);
              }
            "
            @directory-added="
              (directoryDetails) => {
                // console.log('Directory added', directoryDetails);
                clearSelectedFilesToUpload({ clearNameInput: true });
                setDirectory(directoryDetails);
                isSubmissionAlertVisible = false;
                setUploadedFileType(FILE_TYPE.DIRECTORY);
              }
            "
          />

          <va-divider />

          <div
            class="flex flex-row"
            v-if="selectingFiles || selectingDirectory"
          >
            <!--            :data-product-directory="dataProductDirectory"-->

            <!--         todo - should not be dataProductDirectory - use 'dataset' instead -->
            <div class="flex-1">
              <va-card class="upload-details">
                <va-card-title>
                  <div class="flex flex-nowrap items-center w-full">
                    <span class="text-lg">Details</span>
                  </div>
                </va-card-title>
                <va-card-content>
                  <UploadedDatasetDetails
                    v-if="selectingFiles || selectingDirectory"
                    v-model:dataset-name-input="datasetNameInput"
                    v-model:dataset-name="dataProductDirectoryName"
                    :selecting-files="selectingFiles"
                    :selecting-directory="selectingDirectory"
                    :uploaded-data-product-error-messages="
                      formErrors[STEP_KEYS.UPLOAD]
                    "
                    :uploaded-data-product-error="
                      !!formErrors[STEP_KEYS.UPLOAD]
                    "
                    :source-raw-data="rawDataSelected"
                    :submission-status="submissionStatus"
                    :status-chip-color="statusChipColor"
                  /> </va-card-content
              ></va-card>
            </div>

            <va-divider vertical />

            <div class="flex-1">
              <DatasetFileUploadTable
                :source-raw-data="
                  rawDataSelected.length > 0 ? rawDataSelected[0] : null
                "
                :status-chip-color="statusChipColor"
                :submission-status="submissionStatus"
                :is-submission-alert-visible="isSubmissionAlertVisible"
                :submission-alert="submissionAlert"
                @file-removed="removeFile"
                :submit-attempted="submitAttempted"
                :submission-alert-color="submissionAlertColor"
                :files="displayedFilesToUpload"
                :selecting-files="selectingFiles"
                :selecting-directory="selectingDirectory"
              />
            </div>
          </div>
        </div>
        <!--          :uploaded-data-product-error-messages="[ formErrors[STEP_KEYS.UPLOAD],-->
        <!--          ]"-->
      </template>

      <!-- custom controls -->
      <template #controls="{ nextStep, prevStep }">
        <div class="flex items-center justify-around w-full">
          <va-button
            class="flex-none"
            preset="primary"
            @click="
              () => {
                isSubmissionAlertVisible = false;
                prevStep();
              }
            "
            :disabled="isPreviousButtonDisabled"
          >
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="onNextClick(nextStep)"
            :color="isLastStep ? 'success' : 'primary'"
            :disabled="isNextButtonDisabled"
          >
            {{ isLastStep ? "Upload" : "Next" }}
          </va-button>
        </div>
      </template>
    </va-stepper>
    <!--    </va-form>-->
  </va-inner-loading>
</template>

<script setup>
import SelectFileButtons from "@/components/dataset/upload/SelectFileButtons.vue";
import config from "@/config";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import uploadService from "@/services/upload";
import { formatBytes } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import _ from "lodash";
import SparkMD5 from "spark-md5";
import { useBreakpoint, useForm } from "vuestic-ui";

const auth = useAuthStore();
const uploadToken = ref(useLocalStorage("uploadToken", ""));

const breakpoint = useBreakpoint();

const { errorMessages, isDirty } = useForm("datasetUploadForm");
const isDirectory = ref(false);

const SUBMISSION_STATES = {
  UNINITIATED: "Uninitiated",
  PROCESSING: "Processing",
  PROCESSING_FAILED: "Processing Failed",
  UPLOADING: "Uploading",
  UPLOAD_FAILED: "Upload Failed",
  UPLOADED: "Uploaded",
};

const STEP_KEYS = {
  RAW_DATA: "rawData",
  UPLOAD: "upload",
};

const DATASET_EXISTS_ERROR = "A Data Product with this name already exists.";
const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";
const HAS_SPACES_ERROR = "cannot contain spaces";

const RETRY_COUNT_THRESHOLD = 1;
const CHUNK_SIZE = 2 * 1024 * 1024; // Size of each chunk, set to 2 Mb
// Blob.slice method is used to segment files.
// At the same time, this method is used in different browsers in different
// ways.
const blobSlice =
  File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;

const steps = [
  { key: STEP_KEYS.RAW_DATA, label: "Source Raw Data", icon: "mdi:dna" },
  {
    key: STEP_KEYS.UPLOAD,
    label: "Upload",
    icon: "material-symbols:folder",
  },
  // { label: "Select Files", icon: "material-symbols:folder" },
];

const UPLOAD_FILE_REQUIRED_ERROR = "A file must be selected for upload.";
const DATASET_NAME_MAX_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";
const SOURCE_RAW_DATA_REQUIRED_ERROR =
  "You have requested a source Raw Data to be assigned. Please select one.";

const formErrors = ref({
  [STEP_KEYS.RAW_DATA]: null,
  [STEP_KEYS.UPLOAD]: null,
});
const formHasErrors = computed(() => {
  const errors = Object.values(formErrors.value);
  return errors.some((error) => {
    return error !== null;
  });
});

const isAssignedSourceRawData = ref(true);
const submissionSuccess = ref(false);

const isPreviousButtonDisabled = computed(() => {
  return step.value === 0 || submitAttempted.value || loading.value;
});

const isNextButtonDisabled = computed(() => {
  return (
    formHasErrors.value ||
    // submitAttempted.value ||
    submissionSuccess.value ||
    [
      SUBMISSION_STATES.PROCESSING,
      SUBMISSION_STATES.UPLOADING,
      SUBMISSION_STATES.UPLOADED,
    ].includes(submissionStatus.value) ||
    loading.value
  );
});

// Tracks if a step's form fields are pristine (i.e. not touched by user) or
// not. Errors are only shown when a step's form fields are not pristine.
// For steps 0 to 2, <va-form-field> components track the pristine state of
// their respective input fields. For step 3, pristine state is maintained by
// this component.
const stepPristineStates = ref([
  { [STEP_KEYS.RAW_DATA]: true },
  { [STEP_KEYS.UPLOAD]: true },
]);

const stepIsPristine = computed(() => {
  return !!Object.values(stepPristineStates.value[step.value])[0];
});

const removeFile = (index) => {
  filesToUpload.value.splice(index, 1);
};

const stringHasSpaces = (name) => {
  return name?.indexOf(" ") > -1;
};

const datasetNameHasMinimumChars = (name) => {
  return name?.length >= 3;
};

const datasetNameIsNull = (name) => {
  return !name;
};

const validateNotExists = (value) => {
  return new Promise((resolve) => {
    // Vuestic claims that it should not run async validation if synchronous
    // validation fails, but it seems to be triggering async validation
    // nonetheless when `value` is ''. Hence the explicit check for whether
    // `value` is falsy.
    if (!value) {
      resolve(true);
    } else {
      datasetService
        .getAll({ type: "DATA_PRODUCT", name: value, match_name_exact: true })
        .then((res) => {
          resolve(res.data.datasets.length !== 0 ? DATASET_EXISTS_ERROR : true);
        });
    }
  });
};

const hasSpacesErrorStr = (prefix) => `${prefix} ${HAS_SPACES_ERROR}`;

const datasetNameValidationRules = [
  (v) => {
    return datasetNameIsNull(v) ? DATASET_NAME_REQUIRED_ERROR : true;
  },
  (v) => {
    return datasetNameHasMinimumChars(v) ? true : DATASET_NAME_MAX_LENGTH_ERROR;
  },
  (v) => {
    return stringHasSpaces(v) ? hasSpacesErrorStr("Dataset name") : true;
  },
  validateNotExists,
];

const loading = ref(true);
const rawDataList = ref([]);
const rawDataSelected = ref([]);
const uploadLog = ref();
const submissionStatus = ref(SUBMISSION_STATES.UNINITIATED);
const statusChipColor = ref("");
const submissionAlert = ref(""); // For handling network errors before upload begins
const submissionAlertColor = ref("");
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);

const filesToUpload = ref([]);
const displayedFilesToUpload = ref([]);

const dataProductDirectory = ref(null);

// TODO - set pristine to false when step === 1 and file or directory selection
//  changes
const dataProductDirectoryName = ref("");
const datasetNameInput = ref("");

const step = ref(0);
const uploadCancelled = ref(false);

const filesNotUploaded = computed(() => {
  return filesToUpload.value.filter(
    (e) => e.uploadStatus !== config.upload.status.UPLOADED,
  );
});
const someFilesPendingUpload = computed(
  () => filesNotUploaded.value.length > 0,
);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

const uploadFormData = computed(() => {
  const datasetName = selectingFiles.value
    ? datasetNameInput.value
    : selectingDirectory.value
      ? dataProductDirectory.value?.name
      : "";
  return {
    name: datasetName,
    ...(rawDataSelected.value.length > 0 && {
      source_dataset_id: rawDataSelected.value[0].id,
    }),
  };
});

const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.RAW_DATA]: null,
    [STEP_KEYS.UPLOAD]: null,
  };
};

const validateDatasetName = async () => {
  const datasetName = selectingFiles.value
    ? datasetNameInput.value
    : selectingDirectory.value
      ? dataProductDirectory.value?.name
      : "";

  if (datasetNameIsNull(datasetName)) {
    return { isNameValid: false, error: DATASET_NAME_REQUIRED_ERROR };
  } else if (!datasetNameHasMinimumChars(datasetName)) {
    return { isNameValid: false, error: DATASET_NAME_MAX_LENGTH_ERROR };
  } else if (stringHasSpaces(datasetName)) {
    return { isNameValid: false, error: hasSpacesErrorStr("Dataset name") };
  }

  return datasetNameValidationRules[3](datasetName).then((res) => {
    return {
      isNameValid: res !== DATASET_EXISTS_ERROR,
      error: DATASET_EXISTS_ERROR,
    };
  });
};

const clearSelectedDirectoryToUpload = () => {
  // clear files within the directory being deleted
  clearSelectedFilesToUpload();
  // clear directory being deleted
  dataProductDirectory.value = null;
  // clear directory name
  dataProductDirectoryName.value = "";
};

const clearSelectedFilesToUpload = ({ clearNameInput = false } = {}) => {
  if (clearNameInput) {
    datasetNameInput.value = "";
  }
  filesToUpload.value = [];
};

// todo - rename these to uploading...
const selectingFiles = ref(false);
const selectingDirectory = ref(false);

const FILE_TYPE = {
  FILE: "file",
  DIRECTORY: "directory",
};

const setUploadedFileType = (fileType) => {
  filesToUpload.value.type = fileType;
  if (fileType === FILE_TYPE.FILE) {
    selectingFiles.value = true;
    selectingDirectory.value = false;
  } else if (fileType === FILE_TYPE.DIRECTORY) {
    selectingDirectory.value = true;
    selectingFiles.value = false;
  }
};

const setFormErrors = async () => {
  resetFormErrors();
  if (step.value === 0) {
    if (!isAssignedSourceRawData.value) {
      formErrors.value[STEP_KEYS.RAW_DATA] = null;
      return;
    }
    if (rawDataSelected.value.length === 0) {
      formErrors.value[STEP_KEYS.RAW_DATA] = SOURCE_RAW_DATA_REQUIRED_ERROR;
      return;
    }
  }

  if (step.value === 1) {
    if (
      (selectingFiles.value || selectingDirectory.value) &&
      filesToUpload.value.length === 0
    ) {
      formErrors.value[STEP_KEYS.UPLOAD] = UPLOAD_FILE_REQUIRED_ERROR;
      return;
    }

    const { isNameValid: datasetNameIsValid, error } =
      await validateDatasetName();

    // if (
    //   (selectingFiles.value && filesToUpload.value?.length === 0) ||
    //   (selectingDirectory.value && !dataProductDirectory.value)
    // ) {
    //   formErrors.value[STEP_KEYS.UPLOAD] = UPLOAD_FILE_REQUIRED_ERROR;
    //   return;
    // }

    if (datasetNameIsValid) {
      formErrors.value[STEP_KEYS.UPLOAD] = null;
    } else {
      formErrors.value[STEP_KEYS.UPLOAD] = error;
    }
  }
};

const noFilesSelected = computed(() => {
  return filesToUpload.value?.length === 0;
});

const addDataset = (selectedDatasets) => {
  rawDataSelected.value = selectedDatasets;
};

const removeDataset = () => {
  rawDataSelected.value = [];
};

onMounted(() => {
  loading.value = true;

  // datasetService.get_file_types(),
  datasetService
    .getAll({ type: "RAW_DATA" })
    .then((res) => {
      rawDataList.value = res.data.datasets;
    })
    .catch((err) => {
      toast.error("Failed to load resources");
      console.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
});

const evaluateFileChecksums = (file) => {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    function loadNext(currentChunkIndex) {
      const start = currentChunkIndex * CHUNK_SIZE;
      const end =
        start + CHUNK_SIZE >= file.size ? file.size : start + CHUNK_SIZE;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    try {
      let chunkIndex = 0;
      const chunks = Math.ceil(file.size / CHUNK_SIZE);
      const buffer = new SparkMD5.ArrayBuffer();
      const chunkChecksums = [];

      fileReader.onload = (e) => {
        const result = e.target.result;
        chunkChecksums.push(SparkMD5.ArrayBuffer.hash(result));

        buffer.append(result); // Append to array buffer
        chunkIndex += 1;
        if (chunkIndex < chunks) {
          loadNext(chunkIndex);
        } else {
          resolve({
            fileChecksum: buffer.end(),
            chunkChecksums,
          });
        }
      };

      fileReader.onerror = () => {
        console.error(`file reading failed for file ${file.name}`);
        reject(fileReader.error);
      };

      loadNext(chunkIndex);
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
};

const evaluateChecksums = (filesToUpload) => {
  return new Promise((resolve, reject) => {
    const filePromises = [];
    for (let i = 0; i < filesToUpload.length; i++) {
      let fileDetails = filesToUpload[i];
      if (!fileDetails.checksumsEvaluated) {
        const file = fileDetails.file;
        fileDetails.numChunks = Math.ceil(file.size / CHUNK_SIZE); // total number of fragments

        filePromises.push(
          new Promise((resolve, reject) => {
            evaluateFileChecksums(file)
              .then(({ fileChecksum, chunkChecksums }) => {
                fileDetails.fileChecksum = fileChecksum;
                fileDetails.chunkChecksums = chunkChecksums;
                fileDetails.checksumsEvaluated = true;
                resolve();
              })
              .catch(() => {
                fileDetails.checksumsEvaluated = false;
                console.error(
                  `Failed to evaluate checksums of file ${file.name}`,
                );
                reject();
              });
          }),
        );
      }
    }

    Promise.all(filePromises)
      .then(() => {
        resolve();
      })
      .catch(() => {
        reject();
      });
  });
};

// Uploads a chunk. Retries to upload chunk upto 5 times in case of network
// errors.
const uploadChunk = async (chunkData) => {
  const upload = async () => {
    if (uploadCancelled.value) {
      return false;
    }

    let chunkUploaded = false;

    uploadService.setToken(uploadToken.value);
    try {
      await uploadService.uploadFile(chunkData);
      chunkUploaded = true;
    } catch (e) {
      console.error(`Encountered error uploading chunk`, e);
    }

    return chunkUploaded;
  };

  let retry_count = 0;
  let uploaded = false;
  while (!uploaded && !uploadCancelled.value) {
    uploaded = await upload();
    if (!uploaded) {
      retry_count += 1;
    }
    if (retry_count > RETRY_COUNT_THRESHOLD) {
      console.error("Exceeded retry threshold");
      break;
    }
  }

  return uploaded;
};

const getFileUploadLog = ({ name, path }) => {
  // console.log(`Getting file upload log for ${name} at ${path}`);
  // console.log("uploadLog files", uploadLog.value.files);
  // console.log("selectingFiles", selectingFiles.value);
  // console.log("selectingDirectory", selectingDirectory.value);
  const fileToUpload = uploadLog.value.files.find((fileUploadLog) => {
    return selectingDirectory.value
      ? fileUploadLog.name === name && fileUploadLog.path === path
      : fileUploadLog.name === name;
  });
  // console.log("fileToUpload", fileToUpload);

  return fileToUpload;
};

const uploadFileChunks = async (fileDetails) => {
  let file = fileDetails.file;
  let uploaded = false;

  const blockCount = fileDetails.numChunks;

  for (let i = 0; i < blockCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);

    const fileData = blobSlice.call(file, start, end);
    // Building form data
    const chunkData = new FormData();
    // If the request's body needs to be accessed before the request's file,
    // the body's fields should be set before the `file` field.
    chunkData.append("checksum", fileDetails.fileChecksum);
    chunkData.append("name", fileDetails.name);
    chunkData.append("total", blockCount);
    chunkData.append("index", i);
    chunkData.append("size", file.size);
    // chunkData.append("data_product_name", fileDetails.name);
    chunkData.append("chunk_checksum", fileDetails.chunkChecksums[i]);
    chunkData.append(
      "data_product_id",
      uploadLog.value.dataset_upload.dataset.id,
    );
    chunkData.append(
      "file_upload_log_id",
      getFileUploadLog({ name: fileDetails.name, path: fileDetails.path })?.id,
    );
    // After setting the request's body, set the request's file
    chunkData.append("file", fileData);

    // Try uploading chunk, or retry until retry threshold is reached
    uploaded = await uploadChunk(chunkData);
    if (!uploaded) {
      break;
    } else {
      const chunkUploadProgress = Math.trunc(((i + 1) / blockCount) * 100);
      if (isDirectory.value) {
        dataProductDirectory.value.progress += chunkUploadProgress;
      } else {
        fileDetails.progress = chunkUploadProgress;
      }
    }
  }

  return uploaded;
};

const uploadFile = async (fileDetails) => {
  // persist token in store
  await auth.onFileUpload(fileDetails.name);

  fileDetails.uploadStatus = config.upload.status.UPLOADING;
  const checksum = fileDetails.fileChecksum;

  const uploaded = await uploadFileChunks(fileDetails);
  if (!uploaded) {
    console.error(`Upload of file ${fileDetails.name} failed`);
  }

  const fileUploadLogId = uploadLog.value.files.find(
    (e) => e.md5 === checksum,
  )?.id;

  fileDetails.uploadStatus = uploaded
    ? config.upload.status.UPLOADED
    : config.upload.status.UPLOAD_FAILED;

  let updated = false;
  if (uploaded) {
    try {
      await uploadService.updateFileUploadLog(
        uploadLog.value.id,
        fileUploadLogId,
        {
          status: config.upload.status.UPLOADED,
        },
      );
      updated = true;
    } catch (e) {
      console.error(e);
    }
  }

  const successful = uploaded && updated;
  if (!successful) {
    delete fileDetails.progress;
  }

  auth.postFileUpload();
  return successful;
};

const onSubmit = async () => {
  if (filesToUpload.value.length === 0) {
    await setFormErrors();
    return Promise.reject();
  }

  submissionStatus.value = SUBMISSION_STATES.PROCESSING;
  statusChipColor.value = "primary";
  submissionAlert.value = null; // reset any alerts from previous submissions
  isSubmissionAlertVisible.value = false;
  submitAttempted.value = true;

  return new Promise((resolve, reject) => {
    preUpload()
      .then(async () => {
        submissionSuccess.value = true;
        submissionStatus.value = SUBMISSION_STATES.UPLOADING;

        const filesUploaded = await uploadFiles(filesNotUploaded.value);
        if (filesUploaded) {
          resolve();
        } else {
          // console.log("reject upload");
          submissionStatus.value = SUBMISSION_STATES.UPLOAD_FAILED;
          submissionAlert.value = "Some files could not be uploaded.";
          reject();
        }
      })
      .catch((err) => {
        console.error(err);
        submissionStatus.value = SUBMISSION_STATES.PROCESSING_FAILED;
        submissionAlert.value =
          "There was an error. Please try submitting again.";
        reject();
      });
  });
};

const postSubmit = () => {
  if (!someFilesPendingUpload.value) {
    submissionStatus.value = SUBMISSION_STATES.UPLOADED;
    statusChipColor.value = "primary";
    submissionAlertColor.value = "success";
    submissionAlert.value =
      "All files have been uploaded successfully. You may close this window.";
    isSubmissionAlertVisible.value = true;
  }

  const failedFileUpdates = filesNotUploaded.value.map((file) => {
    return {
      id: uploadLog.value.files.find((f) => f.md5 === file.fileChecksum).id,
      data: {
        status: config.upload.status.UPLOAD_FAILED,
      },
    };
  });

  if (uploadLog.value) {
    createOrUpdateUploadLog(uploadLog.value.id, {
      status: someFilesPendingUpload.value
        ? config.upload.status.UPLOAD_FAILED
        : config.upload.status.UPLOADED,
      files: failedFileUpdates,
    })
      .then((res) => {
        uploadLog.value = res.data;
      })
      .catch((err) => {
        console.error(err);
      });
  }
};

const handleSubmit = () => {
  onSubmit() // resolves once all files have been uploaded
    .then(() => {
      return uploadService.processUpload(
        uploadLog.value.dataset_upload.dataset.id,
        config.upload.types.DATASET,
      );
    })
    .catch((err) => {
      console.log("onSubmit catch error");
      console.error(err);
      submissionSuccess.value = false;
      statusChipColor.value = "warning";
      submissionAlertColor.value = "warning";
      isSubmissionAlertVisible.value = true;
    })
    .finally(() => {
      postSubmit();
    });
};

const onNextClick = (nextStep) => {
  if (isLastStep.value) {
    if (noFilesSelected.value) {
      isSubmissionAlertVisible.value = true;
      submissionAlert.value =
        "At least one file must be selected to create a Data Product";
      submissionAlertColor.value = "warning";
    } else {
      handleSubmit();
    }
  } else {
    nextStep();
  }
};

// Evaluates selected file checksums, logs the upload
const preUpload = async () => {
  console.log("preUpload");
  await evaluateChecksums(filesNotUploaded.value);

  const logData = uploadLog.value?.id
    ? {
        status: config.upload.status.UPLOADING,
      }
    : {
        ...uploadFormData.value,
        files_metadata: filesToUpload.value.map((e) => {
          return {
            name: e.name,
            checksum: e.fileChecksum,
            num_chunks: e.numChunks,
            path: e.path,
          };
        }),
      };

  const res = await createOrUpdateUploadLog(uploadLog.value?.id, logData);
  uploadLog.value = res.data;
};

// Log (or update) upload status
const createOrUpdateUploadLog = (uploadLogId, data) => {
  // console.log("createOrUpdateUploadLog", uploadLogId, data);
  return !uploadLogId
    ? uploadService.logDatasetUpload(data)
    : uploadService.updateUploadLog(uploadLogId, data);
};

const uploadFiles = async (files) => {
  let uploaded = false;
  for (let f = 0; f < files.length; f++) {
    let fileDetails = files[f];
    uploaded = await uploadFile(fileDetails);
    if (!uploaded) {
      break;
    }
  }
  return uploaded;
};

// two files can't have same path/name
const setFiles = (files) => {
  _.range(0, files.length).forEach((i) => {
    const file = files.item(i);
    filesToUpload.value.push({
      type: FILE_TYPE.FILE,
      file: file,
      name: file.name,
      formattedSize: formatBytes(file.size),
      progress: undefined,
    });
  });
  displayedFilesToUpload.value = filesToUpload.value;
};

// two files can't have the same name and path
const setDirectory = (directoryDetails) => {
  isDirectory.value = true;
  // dataProductDirectory.value = directoryDetails;

  const directoryFiles = directoryDetails.files;
  let directorySize = 0;
  _.range(0, directoryFiles.length).forEach((i) => {
    const file = directoryFiles[i];
    filesToUpload.value.push({
      type: FILE_TYPE.FILE,
      file: file,
      name: file.name,
      formattedSize: formatBytes(file.size),
      progress: undefined,
      path: file.path,
    });
    directorySize += file.size;
  });
  dataProductDirectory.value = {
    type: FILE_TYPE.DIRECTORY,
    name: directoryDetails.directoryName,
    formattedSize: formatBytes(directorySize),
    progress: undefined,
    uploadStatus: config.upload.status.PROCESSING_FAILED,
  };
  dataProductDirectoryName.value = dataProductDirectory.value.name;

  displayedFilesToUpload.value = [dataProductDirectory.value];
};

// const validateDatasetName = async () => {
//   const datasetName = selectedUploadFiles.value?.name;
//   if (datasetNameIsNull(datasetName)) {
//     return { isNameValid: false, error: UPLOAD_FILE_REQUIRED_ERROR };
//   } else if (!datasetNameHasMinimumChars(datasetName)) {
//     return { isNameValid: false, error: DATASET_NAME_MAX_LENGTH_ERROR };
//   }
//
//   return validateNotExists(datasetName).then((res) => {
//     return {
//       isNameValid: res !== DATASET_NAME_EXISTS_ERROR,
//       error:
//         res !== DATASET_NAME_EXISTS_ERROR ? null : DATASET_NAME_EXISTS_ERROR,
//     };
//   });
// };

onMounted(() => {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
  window.addEventListener("beforeunload", (e) => {
    if (
      submitAttempted.value &&
      submissionStatus.value !== SUBMISSION_STATES.UPLOADED
    ) {
      // show warning before user leaves page
      e.returnValue = true;
    }
  });
});

watch(
  [
    rawDataSelected,
    datasetNameInput,
    dataProductDirectoryName,
    selectingFiles,
    selectingDirectory,
    // selectedFile,
    // fileListSearchText,
    // isFileSearchAutocompleteOpen,
    // searchSpace,
    isAssignedSourceRawData,
    filesToUpload,
  ],
  async (newVals, oldVals) => {
    // mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    if (stepKey === STEP_KEYS.RAW_DATA) {
      stepPristineStates.value[step.value][stepKey] = !oldVals[0] && newVals[0];
    } else {
      stepPristineStates.value[step.value][stepKey] = false;
    }

    await setFormErrors();
  },
);

onMounted(() => {
  setFormErrors();
});

// show warning before user moves to a different route
onBeforeRouteLeave(() => {
  return submitAttempted.value &&
    submissionStatus.value !== SUBMISSION_STATES.UPLOADED
    ? window.confirm(
        "Leaving this page before all files have been processed/uploaded will" +
          " cancel the upload. Do you wish to continue?",
      )
    : true;
});

onBeforeUnmount(() => {
  // Cancels pending uploads and prompts cleanup activities before page unload
  uploadCancelled.value = true;
});
</script>

<style lang="scss">
.create-data-product-stepper {
  .step-button {
    color: var(--va-secondary);
  }

  .step-button--active {
    color: var(--va-primary);
  }

  .step-button--completed {
    color: var(--va-primary);
  }

  .step-button:hover {
    background-color: var(--va-background-element);
  }

  .va-stepper__step-content-wrapper {
    // flex: 1 to expand the element to available height
    // min-height: 0 to shrink the elemenet to below its calculated min-height of children
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .va-stepper__step-content {
    // step-content-wrapper contains step-content and controls
    // only shrink and grow step-content
    flex: 1;
    min-height: auto;
    overflow-y: scroll;
  }

  .raw_data_select .va-select-content__autocomplete {
    padding-top: 7.5px;
    padding-bottom: 7.5px;
  }

  .upload-details {
    height: 290px;
    max-height: 290px;
  }
}
</style>
