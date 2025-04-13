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
          :disabled="isStepperButtonDisabled(i)"
          preset="secondary"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="s.icon" />
            <span class="hidden sm:block"> {{ s.label }} </span>
          </div>
        </va-button>
      </template>

      <template #step-content-0>
        <div class="flex flex-col">
          <SelectFileButtons
              :disabled="submitAttempted || loading || validatingForm"
              @files-added="
              (files) => {
                console.log('Files added:', files);
                clearSelectedDirectoryToUpload();
                setFiles(files);
                isSubmissionAlertVisible = false;
                setUploadedFileType(FILE_TYPE.FILE);
              }
            "
              @directory-added="
              (directoryDetails) => {
                clearSelectedFilesToUpload();
                setDirectory(directoryDetails);
                isSubmissionAlertVisible = false;
                setUploadedFileType(FILE_TYPE.DIRECTORY);
              }
            "
          />

          <va-divider/>

          <SelectedFilesTable
              @file-removed="removeFile"
              :files="displayedFilesToUpload"
          />
        </div>
      </template>

      <template #step-content-1>
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

      <template #step-content-2>
        <div class="flex flex-col gap-10">
          <va-checkbox
              v-model="isAssignedProject"
              @update:modelValue="
              (val) => {
                if (!val) {
                  projectSelected = {};
                }
              }
            "
              color="primary"
              label="Assign Project"
          />

          <va-form-field
              v-model="projectSelected"
              v-slot="{ value: v }"
          >
            <div class="sm:min-w-[600px] sm:max-h-[65vh] sm:min-h-[50vh]">
              <div class="space-y-4">
                <ProjectSelect
                    @select="setProject"
                    :disabled="!isAssignedProject"
                    :for-self="!auth.canOperate"
                ></ProjectSelect>

                <ProjectList
                    v-if="Object.values(projectSelected).length > 0"
                    :projects="[Object.values(projectSelected)[0]]"
                    show-remove
                    @remove="(project) => {
                  // console.log('Removing project in template:', project);
                  resetSelectedProject()
                }">
                </ProjectList>
              </div>
            </div>
          </va-form-field>
        </div>
      </template>

      <template #step-content-3>
        <div
            class="flex flex-row"
            v-if="selectingFiles || selectingDirectory"
        >
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
                    :dataset="datasetUploadLog?.dataset"
                    v-model:populated-dataset-name="populatedDatasetName"
                    :input-disabled="submitAttempted"
                    :uploaded-data-product-error-messages="
                      formErrors[STEP_KEYS.INFO]
                    "
                    :uploaded-data-product-error="
                      !!formErrors[STEP_KEYS.INFO]
                    "
                    :project="projectSelected && Object.values(projectSelected)[0]"
                    :source-raw-data="rawDataSelected"
                    :submission-status="submissionStatus"
                    :submission-alert="submissionAlert"
                    :status-chip-color="statusChipColor"
                    :submission-alert-color="submissionAlertColor"
                    :is-submission-alert-visible="isSubmissionAlertVisible"
                />
              </va-card-content
              >
            </va-card>
          </div>

          <va-divider vertical/>

          <div class="flex-1">
            <DatasetFileUploadTable
                :files="displayedFilesToUpload"
            />
          </div>
        </div>
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
import Constants from "@/constants";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import uploadService from "@/services/upload";
import datasetUploadService from "@/services/upload/dataset";
import { formatBytes } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import { jwtDecode } from "jwt-decode";
import _ from "lodash";
import SparkMD5 from "spark-md5";
import SelectedFilesTable from "@/components/dataset/upload/SelectedFilesTable.vue";
import {VaDivider} from "vuestic-ui";

const auth = useAuthStore();
const uploadToken = ref(useLocalStorage("uploadToken", ""));
// const token = ref(useLocalStorage("token", ""));

const STEP_KEYS = {
  PROJECT: "project",
  RAW_DATA: "rawData",
  UPLOAD: "upload",
  INFO: "info"
};

const DATASET_EXISTS_ERROR = "A Data Product with this name already exists.";
const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";
const HAS_SPACES_ERROR = "cannot contain spaces";

const FORM_VALIDATION_ERROR = "An unknown error occurred";

const RETRY_COUNT_THRESHOLD = 5;
const CHUNK_SIZE = 2 * 1024 * 1024; // Size of each chunk, set to 2 Mb
// Blob.slice method is used to segment files.
// At the same time, this method is used in different browsers in different
// ways.
const blobSlice =
  File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;

const steps = [
  {
    key: STEP_KEYS.UPLOAD,
    label: "Select Files",
    icon: "material-symbols:folder",
  },
  { key: STEP_KEYS.RAW_DATA, label: "Source Raw Data", icon: "mdi:dna" },
  {key: STEP_KEYS.PROJECT, label: "Project", icon: "mdi:flask"},
  {key: STEP_KEYS.INFO, label: "Upload Details", icon: "mdi:dna"},
];

const UPLOAD_FILE_REQUIRED_ERROR = "A file must be selected for upload.";
const DATASET_NAME_MAX_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";
const SOURCE_RAW_DATA_REQUIRED_ERROR =
  "You have requested a source Raw Data to be assigned. Please select one.";
const PROJECT_REQUIRED_ERROR = "Project must be selected.";

const formErrors = ref({
  [STEP_KEYS.PROJECT]: null,
  [STEP_KEYS.RAW_DATA]: null,
  [STEP_KEYS.UPLOAD]: null,
  [STEP_KEYS.INFO]: null
});

const stepHasErrors = computed(() => {
  if (step.value === 0) {
    return !!formErrors.value[STEP_KEYS.UPLOAD];
  } else if (step.value === 1) {
    return !!formErrors.value[STEP_KEYS.RAW_DATA];
  } else if (step.value === 2) {
    return !!formErrors.value[STEP_KEYS.PROJECT];
  } else if (step.value === 3) {
    return !!formErrors.value[STEP_KEYS.INFO];
  }
});

const isAssignedSourceRawData = ref(true);
const isAssignedProject = ref(true);
const submissionSuccess = ref(false);

const isPreviousButtonDisabled = computed(() => {
  return (
    step.value === 0 ||
    submitAttempted.value ||
    loading.value ||
    validatingForm.value
  );
});

const isNextButtonDisabled = computed(() => {
  return (
    stepHasErrors.value ||
    submissionSuccess.value ||
    [
      Constants.UPLOAD_STATES.PROCESSING,
      Constants.UPLOAD_STATES.UPLOADING,
      Constants.UPLOAD_STATES.UPLOADED,
    ].includes(submissionStatus.value) ||
    loading.value ||
    validatingForm.value
  );
});

const isStepperButtonDisabled = (stepIndex) => {
  return (
    submitAttempted.value ||
    submissionSuccess.value ||
    step.value < stepIndex ||
    loading.value ||
    validatingForm.value
  );
};

// Tracks if a step's form fields are pristine (i.e. not touched by user) or
// not. Errors are only shown when a step's form fields are not pristine.
// For steps 0 to 2, <va-form-field> components track the pristine state of
// their respective input fields. For step 3, pristine state is maintained by
// this component.
const stepPristineStates = ref([
  { [STEP_KEYS.PROJECT]: true },
  { [STEP_KEYS.RAW_DATA]: true },
  { [STEP_KEYS.UPLOAD]: true },
  {[STEP_KEYS.INFO]: true}
]);

const stepIsPristine = computed(() => {
  return !!Object.values(stepPristineStates.value[step.value])[0];
});

const removeFile = (fileIndex) => {
  if (selectingDirectory.value) {
    selectingDirectory.value = false;
    clearSelectedDirectoryToUpload();
  } else if (selectingFiles.value) {
    filesToUpload.value.splice(fileIndex, 1);
    if (filesToUpload.value.length === 0) {
      selectingFiles.value = false;
    }
  }
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
  return new Promise((resolve, reject) => {
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
          resolve(res.data.datasets.length > 0 ? DATASET_EXISTS_ERROR : true);
        })
        .catch(() => {
          reject();
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

const setProject  = project => {
  // console.log('set project', project)
  // console.log('projectSelected', projectSelected.value)
  // console.log('projectId', project.id)
  // resetSelectedProject(project)
  projectSelected.value = { [project.id]: project }

  // console.log('projectSelected after remove', projectSelected.value)
  // projectSelected.value[project.id] = project
  // console.log('projectSelected after set', projectSelected.value)
}

const resetSelectedProject = (project) => {
  // console.log('remove project', project)
  // console.log('projectSelected before remove', projectSelected.value)
  // console.log("typeof projectSelected.value", typeof projectSelected.value)
  // console.log("project.id", project.id)
  // console.log("projectSelected.value[project.id]", projectSelected.value[project.id])
  projectSelected.value = {};
  // console.log('projectSelected after remove', projectSelected.value)
}


const loading = ref(false);
const validatingForm = ref(false);
const rawDataList = ref([]);
const rawDataSelected = ref([]);
const projectSelected = ref({});
const datasetUploadLog = ref(null);
const submissionStatus = ref(Constants.UPLOAD_STATES.UNINITIATED);
const statusChipColor = ref("");
const submissionAlert = ref(""); // For handling network errors before upload begins
const submissionAlertColor = ref("");
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const isUploadIncomplete = computed(() => {
  return (
    submitAttempted.value &&
    submissionStatus.value !== Constants.UPLOAD_STATES.UPLOADED
  );
});

const filesToUpload = ref([]);
const displayedFilesToUpload = ref([]);

const selectedDirectory = ref(null);
const selectedDirectoryChunkCount = ref(0);
const totalUploadedChunkCount = ref(0);
const uploadingFilesState = ref({});

const selectingFiles = ref(false);
const selectingDirectory = ref(false);

const populatedDatasetName = ref("")

watch(selectingFiles, () => {
  if (selectingFiles.value) {
    populatedDatasetName.value = ""
  }
})

watch(selectingDirectory, () => {
  if (selectingDirectory.value) {
    populatedDatasetName.value = selectedDirectory.value.name
  }
})



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
  return {
    name: populatedDatasetName.value,
    type: "DATA_PRODUCT",
    ...(rawDataSelected.value.length > 0 && {
      source_dataset_id: rawDataSelected.value[0].id,
    }),
  };
});

const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.PROJECT]: null,
    [STEP_KEYS.RAW_DATA]: null,
    [STEP_KEYS.UPLOAD]: null,
    [STEP_KEYS.INFO]: null,
  };
};

const validateDatasetName = async () => {
  if (datasetNameIsNull(populatedDatasetName.value)) {
    return { isNameValid: false, error: DATASET_NAME_REQUIRED_ERROR };
  } else if (!datasetNameHasMinimumChars(populatedDatasetName.value)) {
    return { isNameValid: false, error: DATASET_NAME_MAX_LENGTH_ERROR };
  } else if (stringHasSpaces(populatedDatasetName.value)) {
    return { isNameValid: false, error: hasSpacesErrorStr("Dataset name") };
  }

  validatingForm.value = true;
  return datasetNameValidationRules[3](populatedDatasetName.value)
    .then((res) => {
      return {
        isNameValid: res !== DATASET_EXISTS_ERROR,
        error: DATASET_EXISTS_ERROR,
      };
    })
    .catch(() => {
      return { isNameValid: false, error: FORM_VALIDATION_ERROR };
    })
    .finally(() => {
      validatingForm.value = false;
    });
};

const clearSelectedDirectoryToUpload = ({
  clearDirectoryFiles = true,
} = {}) => {
  // clear files within the directory being removed
  if (clearDirectoryFiles) {
    clearSelectedFilesToUpload();
  }
  // clear directory being removed
  selectedDirectory.value = null;
  // clear directory name
  // selectedDirectoryName.value = "";
};

const clearSelectedFilesToUpload = () => {
  displayedFilesToUpload.value = [];
};


const FILE_TYPE = {
  FILE: "file",
  DIRECTORY: "directory",
};

const setUploadedFileType = (fileType) => {
  if (fileType === FILE_TYPE.FILE) {
    selectingFiles.value = true;
    selectingDirectory.value = false;
  } else if (fileType === FILE_TYPE.DIRECTORY) {
    selectingDirectory.value = true;
    selectingFiles.value = false;
  }
};

const setFormErrors = async () => {
  // console.log("setFormErrors called");
  resetFormErrors();
  // console.log("setFormErrors after resetFormErrors");

  // console.log("step.value", step.value)

  // console.log("!isAssignedSourceRawData", !isAssignedSourceRawData)
  // console.log("formErrors", formErrors.value)
  // console.log("rawDataSelected", rawDataSelected.value)

  if (step.value === 0) {
    if (
        // (selectingFiles.value || selectingDirectory.value) &&
        displayedFilesToUpload.value.length === 0
    ) {
      formErrors.value[STEP_KEYS.UPLOAD] = UPLOAD_FILE_REQUIRED_ERROR;
      return;
    }
  }

  if (step.value === 1) {
    // console.log("isAssignedSourceRawData", isAssignedSourceRawData.value)
    // console.log("rowDataSelected", rawDataSelected.value)
    if (!isAssignedSourceRawData.value) {
      formErrors.value[STEP_KEYS.RAW_DATA] = null;
      return;
    }
    if (rawDataSelected.value.length === 0) {
      formErrors.value[STEP_KEYS.RAW_DATA] = SOURCE_RAW_DATA_REQUIRED_ERROR;
      return
    }
  }

  if (step.value === 2) {
    if (!isAssignedProject.value) {
      formErrors.value[STEP_KEYS.PROJECT] = null;
      return
    } else if (Object.values(projectSelected.value).length === 0) {
      formErrors.value[STEP_KEYS.PROJECT] = PROJECT_REQUIRED_ERROR;
      return
    }
  }

  if (step.value === 3) {
    const {isNameValid: datasetNameIsValid, error} = await validateDatasetName();
    if (datasetNameIsValid) {
      formErrors.value[STEP_KEYS.INFO] = null;
    } else {
      formErrors.value[STEP_KEYS.INFO] = error;
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
        // Total number of chunks to be uploaded.
        // A single chunk is uploaded for an empty file
        fileDetails.numChunks =
          file.size > 0 ? Math.ceil(file.size / CHUNK_SIZE) : 1;
        if (selectingDirectory.value) {
          selectedDirectoryChunkCount.value += fileDetails.numChunks;
        }

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

const updateUploadToken = async (fileName) => {
  const currentToken = uploadToken.value;
  const currentTokenDecoded = currentToken ? jwtDecode(currentToken) : null;
  const lastUploadedFileName = currentTokenDecoded
    ? currentTokenDecoded.scope.slice(config.upload.scope_prefix.length)
    : null;

  await auth.refreshUploadToken({
    fileName,
    refreshToken: fileName !== lastUploadedFileName,
  });
  // uploadService.setToken(token.value);
  uploadService.setToken(uploadToken.value);
};

// Uploads a chunk. Retries to upload chunk upto 5 times in case of network
// errors.
const uploadChunk = async (chunkData) => {
  const upload = async () => {
    if (uploadCancelled.value) {
      return false;
    }

    let chunkUploaded = false;

    try {
      // update upload token if needed
      await updateUploadToken(chunkData.get("name"));
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
      console.error(
        `Exceeded retry threshold of ${RETRY_COUNT_THRESHOLD} times`,
      );
      break;
    }
  }

  return uploaded;
};

const getFileUploadLog = ({ name, path }) => {
  return datasetUploadLog.value.upload_log.files.find((fileUploadLog) => {
    return selectingDirectory.value
      ? fileUploadLog.name === name && fileUploadLog.path === path
      : fileUploadLog.name === name;
  });
};

const isFileUploadInProgress = ({ fileUploadLogId } = {}) => {
  return !!uploadingFilesState.value[fileUploadLogId];
};

const isFileChunkUploadInterrupted = ({ fileUploadLogId, chunkIndex } = {}) => {
  return (
    isFileUploadInProgress({ fileUploadLogId }) &&
    !uploadingFilesState.value[fileUploadLogId]["fileUploadInProgress"] &&
    uploadingFilesState.value[fileUploadLogId][
      "resumeFileUploadAtChunkIndex"
    ] === chunkIndex
  );
};

const postChunkUploadAttempt = ({
  fileUploadLogId,
  chunkIndex,
  isChunkUploaded,
} = {}) => {
  if (isChunkUploaded) {
    totalUploadedChunkCount.value += 1;
    uploadingFilesState.value[fileUploadLogId]["uploadedChunks"].push(
      chunkIndex,
    );
    uploadingFilesState.value[fileUploadLogId]["fileUploadInProgress"] = true;
    uploadingFilesState.value[fileUploadLogId]["resumeFileUploadAtChunkIndex"] =
      null;
  } else {
    uploadingFilesState.value[fileUploadLogId]["fileUploadInProgress"] = false;
    uploadingFilesState.value[fileUploadLogId]["resumeFileUploadAtChunkIndex"] =
      chunkIndex;
  }
};

const uploadFileChunks = async (fileDetails) => {
  let file = fileDetails.file;
  const fileUploadLog = getFileUploadLog({
    name: fileDetails.name,
    path: fileDetails.path,
  });

  // initialize state to track upload state of each file chunk
  if (!uploadingFilesState.value[fileUploadLog.id]) {
    uploadingFilesState.value[fileUploadLog.id] = {};
  }
  if (!uploadingFilesState.value[fileUploadLog.id]["uploadedChunks"]) {
    uploadingFilesState.value[fileUploadLog.id]["uploadedChunks"] = [];
  }

  const numberOfChunksToUpload = fileDetails.numChunks;

  for (let i = 0; i < numberOfChunksToUpload; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);

    const fileData = blobSlice.call(file, start, end);
    // Building form data
    const chunkData = new FormData();
    // If the request's body needs to be accessed before the request's file,
    // the body's fields should be set before the `file` field.
    chunkData.append("checksum", fileDetails.fileChecksum);
    chunkData.append("name", fileDetails.name);
    chunkData.append("total", numberOfChunksToUpload);
    chunkData.append("index", i);
    chunkData.append("size", file.size);
    chunkData.append("chunk_checksum", fileDetails.chunkChecksums[i]);
    chunkData.append("uploaded_entity_id", datasetUploadLog.value.dataset.id);
    chunkData.append("file_upload_log_id", fileUploadLog?.id);
    // After setting the request's body, set the request's file
    chunkData.append("file", fileData);

    const isFileUploadNotInitiated = isFileUploadInProgress({
      fileUploadLogId: chunkData.get("file_upload_log_id"),
    });
    let isChunkUploadInterrupted = isFileChunkUploadInterrupted({
      fileUploadLogId: chunkData.get("file_upload_log_id"),
      chunkIndex: chunkData.get("index"),
    });
    let isChunkUploaded = uploadingFilesState.value[fileUploadLog.id][
      "uploadedChunks"
    ].includes(chunkData.get("index"));
    const willUploadChunk =
      !isFileUploadNotInitiated || !isChunkUploaded || isChunkUploadInterrupted;

    if (willUploadChunk) {
      isChunkUploaded = await uploadChunk(chunkData);
      postChunkUploadAttempt({
        fileUploadLogId: chunkData.get("file_upload_log_id"),
        chunkIndex: chunkData.get("index"),
        isChunkUploaded,
      });
      if (!isChunkUploaded) {
        break;
      }
    }

    if (isChunkUploaded) {
      // Update the percentage upload progress of the file/directory currently
      // being uploaded
      if (selectingDirectory.value) {
        selectedDirectory.value.progress = Math.trunc(
          (totalUploadedChunkCount.value / selectedDirectoryChunkCount.value) *
            100,
        );
      } else {
        fileDetails.progress = Math.trunc(
          ((i + 1) / numberOfChunksToUpload) * 100,
        );
      }
    }
  }

  return (
    uploadingFilesState.value[fileUploadLog.id]["uploadedChunks"].length ===
    numberOfChunksToUpload
  );
};

const uploadFile = async (fileDetails) => {
  fileDetails.uploadStatus = config.upload.status.UPLOADING;
  const checksum = fileDetails.fileChecksum;

  const uploaded = await uploadFileChunks(fileDetails);
  if (!uploaded) {
    console.error(`Upload of file ${fileDetails.name} failed`);
  }

  const fileUploadLogId = datasetUploadLog.value.upload_log.files.find(
    (e) => e.md5 === checksum,
  )?.id;

  fileDetails.uploadStatus = uploaded
    ? config.upload.status.UPLOADED
    : config.upload.status.UPLOAD_FAILED;

  let updated = false;
  if (uploaded) {
    try {
      await datasetUploadService.updateDatasetUploadLog(
        datasetUploadLog.value.dataset_id,
        auth.user?.username,
        {
          files: [
            {
              id: fileUploadLogId,
              data: { status: config.upload.status.UPLOADED },
            },
          ],
        },
      );
      updated = true;
    } catch (e) {
      console.error(e);
    }
  }

  const successful = uploaded && updated;
  if (!successful) {
    if (selectingDirectory.value) {
      delete selectedDirectory.value.progress;
    } else if (selectingFiles.value) {
      delete fileDetails.progress;
    }
  }

  return successful;
};

const onSubmit = async () => {
  if (filesToUpload.value.length === 0) {
    await setFormErrors();
    return Promise.reject();
  }

  submissionStatus.value = Constants.UPLOAD_STATES.PROCESSING;
  statusChipColor.value = "primary";
  submissionAlert.value = null; // reset any alerts from previous submissions
  isSubmissionAlertVisible.value = false;
  submitAttempted.value = true;

  return new Promise((resolve, reject) => {
    preUpload()
      .then(async () => {
        submissionSuccess.value = true;
        submissionStatus.value = Constants.UPLOAD_STATES.UPLOADING;

        const filesUploaded = true;
        if (filesUploaded) {
          resolve();
        } else {
          submissionStatus.value = Constants.UPLOAD_STATES.UPLOAD_FAILED;
          submissionAlert.value = "Some files could not be uploaded.";
          reject();
        }
      })
      .catch((err) => {
        console.error(err);
        submissionStatus.value = Constants.UPLOAD_STATES.PROCESSING_FAILED;
        submissionAlert.value =
          "There was an error. Please try submitting again.";
        reject();
      });
  });
};

const setPostSubmissionSuccessState = () => {
  if (!someFilesPendingUpload.value) {
    submissionStatus.value = Constants.UPLOAD_STATES.UPLOADED;
    statusChipColor.value = "primary";
    submissionAlertColor.value = "success";
    submissionAlert.value =
      "All files have been uploaded successfully. You may close this window.";
    isSubmissionAlertVisible.value = true;
  }
};

const postSubmit = () => {
  setPostSubmissionSuccessState();

  const failedFileUpdates = filesNotUploaded.value.map((file) => {
    return {
      id: datasetUploadLog.value.upload_log.files.find(
        (f) => f.md5 === file.fileChecksum,
      ).id,
      data: {
        status: config.upload.status.UPLOAD_FAILED,
      },
    };
  });

  if (datasetUploadLog.value) {
    createOrUpdateUploadLog({
      status: someFilesPendingUpload.value
        ? config.upload.status.UPLOAD_FAILED
        : config.upload.status.UPLOADED,
      files: failedFileUpdates,
    })
      .then((res) => {
        datasetUploadLog.value = res.data;
      })
      .catch((err) => {
        console.error(err);
      });
  }
};

const handleSubmit = () => {
  onSubmit() // resolves once all files have been uploaded
    .then(() => {
      return datasetUploadService.processDatasetUpload(
        datasetUploadLog.value.dataset_id,
        auth.user?.username,
      );
    })
    .catch((err) => {
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
  await evaluateChecksums(filesNotUploaded.value);

  const logData = datasetUploadLog.value?.id
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
        project_id: (Object.entries(projectSelected.value) || []).length > 0 ? Object.keys(projectSelected.value)[0] : null,
      };

  const res = await createOrUpdateUploadLog(logData);
  datasetUploadLog.value = res.data;
};

// watch(projectSelected, (newVal, oldVal) => {
//   console.log("projectSelected changed", projectSelected.value);
// })

// Log (or update) upload status
const createOrUpdateUploadLog = (data) => {
  return !datasetUploadLog.value
    ? datasetUploadService.logDatasetUpload(data)
    : datasetUploadService.updateDatasetUploadLog(
        datasetUploadLog.value?.dataset_id,
        auth.user?.username,
        data,
      );
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
  // console.log("setFiles", files);
  _.range(0, files.length).forEach((i) => {
    const file = files.item(i);
    filesToUpload.value.push({
      type: FILE_TYPE.FILE,
      file: file,
      name: file.name,
      formattedSize: formatBytes(file.size),
      progress: 0,
    });
  });
  displayedFilesToUpload.value = filesToUpload.value;
  console.log("displayedFileasToUploaf", displayedFilesToUpload.value);
};


// two files can't have the same name and path
const setDirectory = (directoryDetails) => {
  const directoryFiles = directoryDetails.files;
  let directorySize = 0;
  _.range(0, directoryFiles.length).forEach((i) => {
    const file = directoryFiles[i];
    filesToUpload.value.push({
      type: FILE_TYPE.FILE,
      file: file,
      name: file.name,
      formattedSize: formatBytes(file.size),
      progress: 0,
      path: file.path,
    });
    directorySize += file.size;
  });
  selectedDirectory.value = {
    type: FILE_TYPE.DIRECTORY,
    name: directoryDetails.directoryName,
    formattedSize: formatBytes(directorySize),
    progress: 0,
    uploadStatus: config.upload.status.PROCESSING_FAILED,
  };
  // selectedDirectoryName.value = selectedDirectory.value.name;

  displayedFilesToUpload.value = [selectedDirectory.value];
};

const beforeUnload = (e) => {
  if (isUploadIncomplete.value) {
    // show warning before user leaves page
    e.returnValue = true;
  }
};

onMounted(() => {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
  window.addEventListener("beforeunload", beforeUnload);
});

watch(
  [
    step,
    projectSelected,
    isAssignedProject,
    rawDataSelected,
    selectingFiles,
    selectingDirectory,
    isAssignedSourceRawData,
    filesToUpload,
    populatedDatasetName
  ],
  async (newVals, oldVals) => {
    // mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    if (stepKey === STEP_KEYS.PROJECT) {
      // `1` corresponds to `projectSelected` in this Watcher
      // `2` corresponds to `isAssignedProject` in this Watcher
      stepPristineStates.value[step.value][stepKey] = (!oldVals[1] && newVals[1]) || (!oldVals[2] && newVals[2]);
    } else if (stepKey === STEP_KEYS.RAW_DATA) {
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

// show alert before user moves to a different route
onBeforeRouteLeave(() => {
  return submitAttempted.value &&
    submissionStatus.value !== Constants.UPLOAD_STATES.UPLOADED
    ? window.confirm(
        "Leaving this page before all files have been processed/uploaded will" +
          " cancel the upload. Do you wish to continue?",
      )
    : true;
});

onBeforeUnmount(async () => {
  // stop any pending uploads before this component unmounts
  uploadCancelled.value = true;

  window.removeEventListener("beforeunload", beforeUnload);

  if (isUploadIncomplete.value) {
    await datasetUploadService.cancelDatasetUpload(
      datasetUploadLog.value.dataset_id,
    );
  }
});

watch((filesToUpload) => {
  debugger
  console.log("filesToUpload", filesToUpload);
})
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
