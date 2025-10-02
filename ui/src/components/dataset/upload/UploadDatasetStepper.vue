<template>
  <va-inner-loading
    :loading="loading"
    class="h-full"
    data-testid="inner-loading"
  >
    <va-stepper
      v-model="step"
      :steps="steps"
      controlsHidden
      class="h-full create-data-product-stepper"
      data-testid="stepper"
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
          :data-testid="`step-button-${i}`"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="s.icon" data-testid="step-icon" />
            <span class="hidden sm:block" data-testid="step-label">
              {{ s.label }}
            </span>
          </div>
        </va-button>
      </template>

      <!-- Step 0 content -->
      <template #step-content-0>
        <div class="flex flex-col" data-testid="step-content-0">
          <SelectFileButtons
            :disabled="submitAttempted || loading || validatingForm"
            @files-added="onFilesAdded"
            @directory-added="onDirectoryAdded"
            data-testid="select-file-buttons"
          />
          <va-divider data-testid="divider-step-0" />
          <SelectedFilesTable
            @file-removed="removeFile"
            :files="displayedFilesToUpload"
            data-testid="upload-selected-files-table"
          />
        </div>
      </template>

      <!-- Step 1 content -->
      <template #step-content-1>
        <div
          class="flex w-full pb-6 items-center"
          data-testid="upload-metadata-dataset-type-row"
        >
          <va-select
            v-model="selectedDatasetType"
            :text-by="'label'"
            :track-by="'value'"
            :options="datasetTypeOptions"
            label="Dataset Type"
            placeholder="Select dataset type"
            class="flex-grow"
            data-testid="upload-metadata-dataset-type-select"
          />
          <div class="flex items-center ml-2">
            <va-popover data-testid="upload-metadata-dataset-type-popover">
              <template #body>
                <div class="w-96" data-testid="dataset-type-help-text">
                  - Raw Data: Original, unprocessed data collected from
                  instruments.
                  <br />
                  - Data Product: Processed data derived from Raw Data
                </div>
              </template>
              <Icon
                icon="mdi:help-circle"
                class="text-xl text-gray-500"
                data-testid="dataset-type-help-icon"
              />
            </va-popover>
          </div>
        </div>

        <div
          class="flex w-full pb-6"
          data-testid="upload-metadata-assign-source-row"
        >
          <div class="w-60 flex flex-shrink-0 mr-4">
            <div class="flex items-center">
              <va-checkbox
                v-model="willAssignSourceRawData"
                @update:modelValue="resetRawDataSearch"
                :disabled="submitAttempted || isRawDataCheckboxDisabled"
                color="primary"
                label="Assign source Raw Data"
                class="flex-grow"
                data-testid="upload-metadata-assign-source-checkbox"
              />
            </div>
          </div>

          <div
            class="flex-grow flex items-center"
            data-testid="upload-metadata-dataset-autocomplete-row"
          >
            <DatasetSelectAutoComplete
              v-model:selected="selectedRawData"
              v-model:search-term="datasetSearchText"
              :disabled="submitAttempted || !isRawDataSearchEnabled"
              :dataset-type="config.dataset.types.RAW_DATA.key"
              placeholder="Search Raw Data"
              @clear="resetRawDataSearch"
              @open="onRawDataSearchOpen"
              @close="onRawDataSearchClose"
              class="flex-grow"
              :label="'Dataset'"
              :messages="noRawDataToAssign ? 'No Raw Data to select' : null"
              data-test-id="upload-metadata-dataset-autocomplete"
            >
            </DatasetSelectAutoComplete>
            <va-popover data-testid="upload-metadata-dataset-autocomplete-popover">
              <template #body>
                <div class="w-96" data-testid="raw-data-help-text">
                  Associating a Data Product with a source Raw Data establishes
                  a clear lineage between the original data and its processed
                  form. This linkage helps to trace the origins of processed
                  data
                </div>
              </template>
              <Icon
                icon="mdi:help-circle"
                class="ml-2 text-xl text-gray-500"
                data-testid="raw-data-help-icon"
              />
            </va-popover>
          </div>
        </div>

        <div
          class="flex w-full pb-6"
          data-testid="upload-metadata-assign-project-row"
        >
          <div class="w-60 flex flex-shrink-0 mr-4">
            <div class="flex items-center">
              <va-checkbox
                v-model="willAssignProject"
                @update:modelValue="
                  (val) => {
                    if (!val) {
                      projectSelected = null;
                    }
                  }
                "
                :disabled="submitAttempted || isProjectCheckboxDisabled"
                color="primary"
                label="Assign Project"
                class="flex-grow"
                data-testid="upload-metadata-assign-project-checkbox"
              />
            </div>
          </div>

          <div class="flex-grow flex items-center">
            <ProjectAsyncAutoComplete
              v-model:selected="projectSelected"
              v-model:search-term="projectSearchText"
              :disabled="submitAttempted || !isProjectSearchEnabled"
              placeholder="Search Projects"
              @clear="resetProjectSearch"
              @open="onProjectSearchOpen"
              @close="onProjectSearchClose"
              class="flex-grow"
              :label="'Project'"
              :messages="noProjectsToAssign ? 'No Projects to select' : null"
              data-test-id="upload-metadata-project-autocomplete"
            >
            </ProjectAsyncAutoComplete>
            <va-popover data-testid="upload-metadata-project-autocomplete-popover">
              <template #body>
                <div class="w-96">
                  Assigning a dataset to a project establishes a connection
                  between your data and a specific research initiatives. This
                  association helps organize and categorize datasets within the
                  context of your research projects, facilitating easier data
                  management, access control, and collaboration among team
                  members working on the same project.
                </div>
              </template>
              <Icon icon="mdi:help-circle" class="ml-2 text-xl text-gray-500" />
            </va-popover>
          </div>
        </div>

        <div
          class="flex w-full pb-6"
          data-testid="upload-metadata-assign-instrument-row"
        >
          <div class="w-60 flex flex-shrink-0 mr-4">
            <div class="flex items-center">
              <va-checkbox
                v-model="willAssignSourceInstrument"
                @update:modelValue="
                  (val) => {
                    if (!val) {
                      selectedSourceInstrument = null;
                    }
                  }
                "
                :disabled="submitAttempted || isInstrumentsCheckboxDisabled"
                color="primary"
                label="Assign source Instrument"
                class="flex-grow"
                data-testid="upload-metadata-assign-instrument-checkbox"
              />
            </div>
          </div>

          <div class="flex-grow flex items-center">
            <va-select
              v-model="selectedSourceInstrument"
              :options="sourceInstrumentOptions"
              :disabled="submitAttempted || !isInstrumentSelectionEnabled"
              label="Source Instrument"
              placeholder="Select Source Instrument"
              class="flex-grow"
              :text-by="'name'"
              :track-by="'id'"
              :messages="
                noInstrumentsToAssign ? 'No Instruments to select' : null
              "
              data-testid="upload-metadata-source-instrument-select"
            />
            <div class="flex items-center ml-2">
              <va-popover data-testid="upload-metadata-source-instrument-popover">
                <template #body>
                  <div class="w-72">
                    Source instrument where this data was collected from.
                  </div>
                </template>
                <Icon icon="mdi:help-circle" class="text-xl text-gray-500" />
              </va-popover>
            </div>
          </div>
        </div>
      </template>

      <template #step-content-2>
        <div class="flex flex-row" v-if="selectingFiles || selectingDirectory">
          <div class="flex-1" data-testid="uploaded-dataset-details">
            <va-card class="upload-details">
              <va-card-title>
                <div class="flex flex-nowrap items-center w-full">
                  <span class="text-lg">Details</span>
                </div>
              </va-card-title>
              <va-card-content>
                <UploadedDatasetDetails
                  v-if="selectingFiles || selectingDirectory"
                  v-model:populated-dataset-name="uploadedDatasetName"
                  :dataset="datasetUploadLog?.audit_log.dataset"
                  :selected-dataset-type="selectedDatasetType.value"
                  :input-disabled="submitAttempted"
                  :dataset-name-error="
                    !stepIsPristine && formErrors[STEP_KEYS.UPLOAD]
                  "
                  :project="projectSelected || projectCreated"
                  :creating-new-project="willCreateNewProject"
                  :source-instrument="selectedSourceInstrument"
                  :source-raw-data="selectedRawData"
                  :submission-status="submissionStatus"
                  :submission-alert="submissionAlert"
                  :status-chip-color="statusChipColor"
                  :submission-alert-color="submissionAlertColor"
                  :is-submission-alert-visible="isSubmissionAlertVisible"
                />
              </va-card-content>
            </va-card>
          </div>

          <va-divider vertical />

          <div class="flex-1" data-testid="dataset-upload-table">
            <DatasetFileUploadTable :files="displayedFilesToUpload" />
          </div>
        </div>
      </template>

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
            data-testid="upload-previous-button"
          >
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="onNextClick(nextStep)"
            :color="isLastStep ? 'success' : 'primary'"
            :disabled="isNextButtonDisabled"
            data-testid="upload-next-button"
          >
            <!--            {{ isLastStep ? (submitAttempted ? "Retry" : "Upload") : "Next" }}-->
            {{ isLastStep ? "Upload" : "Next" }}
          </va-button>
        </div>
      </template>
    </va-stepper>
  </va-inner-loading>
</template>

<script setup>
import DatasetSelectAutoComplete from "@/components/dataset/DatasetSelectAutoComplete.vue";
import config from "@/config";
import { default as Constants } from "@/constants";
import datasetService from "@/services/dataset";
import instrumentService from "@/services/instrument";
import projectService from "@/services/projects";
import toast from "@/services/toast";
import uploadService from "@/services/upload";
import { formatBytes } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import { Icon } from "@iconify/vue";
import { jwtDecode } from "jwt-decode";
import _ from "lodash";
import SparkMD5 from "spark-md5";
import { VaDivider, VaPopover } from "vuestic-ui";

const auth = useAuthStore();

const STEP_KEYS = {
  GENERAL_INFO: "generalInfo",
  SELECT_FILES: "selectFiles",
  UPLOAD: "upload",
};

// Various errors that may be shown to the user during the process of uploading a dataset.
const UNKNOWN_VALIDATION_ERROR = "An unknown error occurred";
const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";
const DATASET_NAME_HAS_SPACES_ERROR = "Dataset name cannot contain spaces";
const DATASET_NAME_MIN_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";

const RETRY_COUNT_THRESHOLD = 5;
const CHUNK_SIZE = 2 * 1024 * 1024; // Size of each chunk, set to 2 Mb

// Blob.slice method is used to segment files.
// At the same time, this method is used in different browsers in different
// ways.
const blobSlice =
  File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;

// The various steps that the user will taken through during the process of uploading a dataset.
const steps = [
  {
    key: STEP_KEYS.SELECT_FILES,
    label: "Select Files",
    icon: "material-symbols:folder",
  },
  {
    key: STEP_KEYS.GENERAL_INFO,
    label: "General Info",
    icon: "material-symbols:info",
  },
  {
    key: STEP_KEYS.UPLOAD,
    label: "Upload",
    icon: "material-symbols:play-circle",
  },
];

// Types of Datasets available to upload
const datasetTypes = [
  {
    label: config.dataset.types.RAW_DATA.label,
    value: config.dataset.types.RAW_DATA.key,
  },
  {
    label: config.dataset.types.DATA_PRODUCT.label,
    value: config.dataset.types.DATA_PRODUCT.key,
  },
];

// Whether individual files are being uploaded, or a single directory is being uploaded.
const FILE_TYPE = {
  FILE: "file",
  DIRECTORY: "directory",
};

// An object containing the form validation errors for each step.
const formErrors = ref({
  [STEP_KEYS.GENERAL_INFO]: null,
  [STEP_KEYS.SELECT_FILES]: null,
  [STEP_KEYS.UPLOAD]: null,
});

// Bearer token used to send requests to the File-Upload API
const uploadToken = ref(useLocalStorage("uploadToken", ""));

// Search-text for Dataset Search
const datasetSearchText = ref("");
// Search-text for Project search
const projectSearchText = ref("");

// Options available to choose from in the `Dataset Type` dropdown.
const datasetTypeOptions = ref(datasetTypes);

// The type of Dataset that the user has selected to upload.
const selectedDatasetType = ref(
  // By default, it is assumed that user will upload a Data Product.
  datasetTypes.find((e) => e.value === config.dataset.types.DATA_PRODUCT.key),
);

/**
 * `stepPristineStates` tracks if a step's form fields are pristine (i.e. not touched by user) or not.
 * Errors are only shown when a step's form fields are not pristine.
 */
const stepPristineStates = ref([
  { [STEP_KEYS.GENERAL_INFO]: true },
  { [STEP_KEYS.SELECT_FILES]: true },
  { [STEP_KEYS.UPLOAD]: true },
]);
// `stepIsPristine` determines whether any of the fields in the current step have been interacted with by the user.
const stepIsPristine = computed(() => {
  return !!Object.values(stepPristineStates.value[step.value])[0];
});

const loading = ref(false);
const validatingForm = ref(false);

// `datasetUploadLog` stores information about the uploaded Dataset that is persisted to the Database.
const datasetUploadLog = ref(null);

// Various values related to the submission process.
const submissionSuccess = ref(false);
const submissionStatus = ref(Constants.UPLOAD_STATUSES.UNINITIATED);
const statusChipColor = ref("");
const submissionAlert = ref(""); // For handling network errors before upload begins
const submissionAlertColor = ref("");
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);

// The files selected by the user for uploading.
const filesToUpload = ref([]);
// The directory selected by the user for uploading.
const selectedDirectory = ref(null);
// The list of files being uploaded that are displayed to the user.
const displayedFilesToUpload = ref([]);

// Determine if the user has selected any files to upload.
const noFilesSelected = computed(() => {
  return filesToUpload.value?.length === 0;
});

const selectedDirectoryChunkCount = ref(0);
const totalUploadedChunkCount = ref(0);

const uploadingFilesState = ref({});

// Determines if a file has been selected to upload
const selectingFiles = ref(false);
// Determines if a directory has been selected to upload
const selectingDirectory = ref(false);

/**
 * Name given to the dataset that the user will upload. This can either be pre-populated by the form,
 * or set by the user.
 * - If a directory is selected for uploading, this value is pre-populated by setting it to the name of the directory.
 * - Is a file is selected for uploading, this value is not set.
 *
 * In both of the above cases, the user can select a name of their choosing before initiating the upload.
 */
const uploadedDatasetName = ref("");

// Current step index
const step = ref(0);

const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

const uploadCancelled = ref(false);

// The list of available Instruments for assigning to the Dataset being uploaded.
const sourceInstrumentOptions = ref([]);

// The Raw Data that will be assigned to the Dataset being uploaded.
const selectedRawData = ref(null);
// The (existing) Project that will be assigned to the Dataset being ingested.
const projectSelected = ref(null);
// The (new) Project that will be assigned to the Dataset being ingested.
const projectCreated = ref(null);
// The Instrument that will be assigned to the Dataset being uploaded.
const selectedSourceInstrument = ref(null);

// determines whether there are any Raw Data options to choose from
const noRawDataToAssign = ref(false);
// determines whether there are any Project options to choose from
const noProjectsToAssign = ref(false);
// determines whether there are any Instrument options to choose from
const noInstrumentsToAssign = ref(false);

// Determines whether the Dataset being uploaded is of type Raw Data or some other type.
const willUploadRawData = computed(() => {
  return (
    selectedDatasetType.value["value"] === config.dataset.types.RAW_DATA.key
  );
});

// Determines whether a new Project will be created and associated with the Dataset being uploaded.
const willCreateNewProject = computed(() => {
  return (
    noProjectsToAssign.value &&
    auth.isFeatureEnabled("auto_create_project_on_dataset_creation")
  );
});

/**
 * Determines if the upload process has been completed.
 *
 * An upload is considered complete if `submissionStatus` has been set to `UPLOADED`. This occurs when:
 * - All files have been uploaded
 * - A network request to initiate the `process_dataset_upload` has been made
 */
const isUploadIncomplete = computed(() => {
  return (
    submitAttempted.value &&
    submissionStatus.value !== Constants.UPLOAD_STATUSES.UPLOADED
  );
});

// Determines whether the current step has form-validation errors.
const stepHasErrors = computed(() => {
  if (step.value === 0) {
    return !!formErrors.value[STEP_KEYS.SELECT_FILES];
  } else if (step.value === 1) {
    return !!formErrors.value[STEP_KEYS.GENERAL_INFO];
  } else if (step.value === 2) {
    return !!formErrors.value[STEP_KEYS.UPLOAD];
  }
});

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
      Constants.UPLOAD_STATUSES.PROCESSING,
      Constants.UPLOAD_STATUSES.UPLOADING,
      Constants.UPLOAD_STATUSES.UPLOADED,
    ].includes(submissionStatus.value) ||
    loading.value ||
    validatingForm.value
  );
});

// List of files whose uploads are pending or in progress
const filesNotUploaded = computed(() => {
  return filesToUpload.value.filter(
    (e) => e.uploadStatus !== Constants.UPLOAD_STATUSES.UPLOADED,
  );
});

// Determines whether there are any files whose uploads are pending or in progress.
const someFilesPendingUpload = computed(
  () => filesNotUploaded.value.length > 0,
);

/**
 * Payload sent along with the network request responsible for creating a database entry of the Dataset being uploaded.
 */
const uploadFormData = computed(() => {
  return {
    name: uploadedDatasetName.value,
    type: selectedDatasetType.value["value"],
    ...(selectedRawData.value && {
      src_dataset_id: selectedRawData.value.id,
    }),
    ...(projectSelected.value && !willCreateNewProject.value && { project_id: projectSelected.value.id }),
    ...(selectedSourceInstrument.value && {
      src_instrument_id: selectedSourceInstrument.value.id,
    }),
    files_metadata: filesToUpload.value.map((e) => {
      return {
        name: e.name,
        checksum: e.fileChecksum,
        num_chunks: e.numChunks,
        path: e.path,
      };
    }),
  };
});

/**
 * Handler invoked when the user selects one or files that are to be uploaded.
 * - Clears the directory to be uploaded if one was set before, along with the files in it.
 * - Sets the new list files to be uploaded.
 * @param files The list of files selected by the user to be uploaded.
 */
const onFilesAdded = (files) => {
  clearSelectedDirectoryToUpload();
  setFiles(files);
  isSubmissionAlertVisible.value = false;
  setUploadedFileType(FILE_TYPE.FILE);
};

/**
 * Handler invoked when the user selects a directory that is to be uploaded.
 * - Clears the files to be uploaded if some were set before.
 * - Sets the new directory be uploaded, along with the list of files in it.
 * @param directoryDetails Information about the files selected by the user.
 * @param {File[]} directoryDetails.files - Array of File objects representing the files in the directory.
 * @param {string} directoryDetails.directoryName - The name of the directory being uploaded.
 */
const onDirectoryAdded = (directoryDetails) => {
  clearSelectedFilesToUpload();
  setDirectory(directoryDetails);
  isSubmissionAlertVisible.value = false;
  setUploadedFileType(FILE_TYPE.DIRECTORY);
};

const resetRawDataSearch = () => {
  selectedRawData.value = null;
  datasetSearchText.value = "";
};

const onRawDataSearchOpen = () => {
  selectedRawData.value = null;
};

const onRawDataSearchClose = () => {
  if (!selectedRawData.value) {
    datasetSearchText.value = "";
  }
};

const resetProjectSearch = () => {
  projectSelected.value = null;
  projectSearchText.value = "";
};

const onProjectSearchOpen = () => {
  projectSelected.value = null;
};

const onProjectSearchClose = () => {
  if (!projectSelected.value) {
    projectSearchText.value = "";
  }
};

// Determines whether the stepper button should be disabled for any given step.
const isStepperButtonDisabled = (stepIndex) => {
  return (
    submitAttempted.value ||
    submissionSuccess.value ||
    step.value < stepIndex ||
    loading.value ||
    validatingForm.value
  );
};

// Handler invoked when a file that is currently selected for upload is removed from the list of files to be uploaded.
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

// Async function to check if a Dataset already exists in the system for a given name and type.
const validateIfExists = (value) => {
  return new Promise((resolve, reject) => {
    // Vuestic claims that it should not run async validation if synchronous
    // validation fails, but it seems to be triggering async validation
    // nonetheless when `value` is ''. Hence the explicit check for whether
    // `value` is falsy.
    if (!value) {
      resolve(true);
    } else {
      datasetService
        .check_if_exists({
          type: selectedDatasetType.value["value"],
          name: value,
        })
        .then((res) => {
          resolve(res.data.exists);
        })
        .catch((e) => {
          console.error(e);
          reject();
        });
    }
  });
};

/**
 * Async function to check if a name selected for the Dataset being uploaded is valid.
 *
 * Conditions to consider a name valid:
 * - Not empty
 * - Minimum length of 3 characters
 * - No spaces
 * - Does not already exist in the system
 */
const validateDatasetName = async () => {
  if (!uploadedDatasetName.value) {
    return { isNameValid: false, error: DATASET_NAME_REQUIRED_ERROR };
  } else if (uploadedDatasetName.value?.length < 3) {
    return { isNameValid: false, error: DATASET_NAME_MIN_LENGTH_ERROR };
  } else if (uploadedDatasetName.value?.indexOf(" ") > -1) {
    return { isNameValid: false, error: DATASET_NAME_HAS_SPACES_ERROR };
  }

  validatingForm.value = true;
  return validateIfExists(uploadedDatasetName.value)
    .then((res) => {
      const datasetExistsError = (datasetType) => {
        const datasetTypeLabel = datasetTypes.find(
          (type) => type.value === datasetType,
        ).label;
        return `A ${datasetTypeLabel} with this name already exists.`;
      };
      return {
        isNameValid: !res,
        error: res && datasetExistsError(selectedDatasetType.value["value"]),
      };
    })
    .catch(() => {
      return { isNameValid: false, error: UNKNOWN_VALIDATION_ERROR };
    })
    .finally(() => {
      validatingForm.value = false;
    });
};

// Clears any details related to the directory that is currently selected for upload, and the files within it.
const clearSelectedDirectoryToUpload = () => {
  // clear files within the directory being removed
  clearSelectedFilesToUpload();
  // clear directory being removed
  selectedDirectory.value = null;
};

// Clears the list of files that are currently selected for upload.
const clearSelectedFilesToUpload = () => {
  displayedFilesToUpload.value = [];
};

// Sets the type of content that is to be uploaded (individual files or a single directory).
const setUploadedFileType = (fileType) => {
  selectingFiles.value = fileType === FILE_TYPE.FILE;
  selectingDirectory.value = fileType === FILE_TYPE.DIRECTORY;
};

// Reset form errors across all steps.
const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.GENERAL_INFO]: null,
    [STEP_KEYS.SELECT_FILES]: null,
    [STEP_KEYS.UPLOAD]: null,
  };
};

// Set form-validation errors for the current step's fields.
const setFormErrors = async () => {
  resetFormErrors();

  if (step.value === 0) {
    if (displayedFilesToUpload.value.length === 0) {
      formErrors.value[STEP_KEYS.SELECT_FILES] = true;
      return;
    }
  }

  if (step.value === 1) {
    if (
      (willAssignSourceRawData.value && !selectedRawData.value) ||
      (willAssignProject.value && !projectSelected.value) ||
      (willAssignSourceInstrument.value && !selectedSourceInstrument.value)
    ) {
      formErrors.value[STEP_KEYS.GENERAL_INFO] = true;
      return;
    }
  }

  if (step.value === 2) {
    const { isNameValid: datasetNameIsValid, error } =
      await validateDatasetName();
    if (datasetNameIsValid) {
      formErrors.value[STEP_KEYS.UPLOAD] = null;
    } else {
      formErrors.value[STEP_KEYS.UPLOAD] = error;
    }
  }
};

/**
 * Evaluates the checksums for a given file by reading it in chunks.
 *
 * @param {File} file - The file to evaluate checksums for.
 * @returns {Promise<Object>} A promise that resolves to an object containing:
 *   - fileChecksum: The MD5 checksum of the entire file.
 *   - chunkChecksums: An array of MD5 checksums for each chunk of the file.
 *
 * @description
 * This function performs the following steps:
 * 1. Initializes a FileReader and a SparkMD5 instance for checksum calculation.
 * 2. Calculates the total number of chunks based on the file size and a predefined CHUNK_SIZE.
 * 3. Reads the file in chunks:
 *    - For each chunk, it calculates and stores its individual MD5 checksum.
 *    - It also appends each chunk to the SparkMD5 instance for the full file checksum.
 * 4. Once all chunks are processed, it finalizes the full file checksum.
 * 5. Returns both the full file checksum and an array of individual chunk checksums.
 *
 * @throws Will reject the promise if there's an error during file reading or checksum calculation.
 */
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
        // console.error(`file reading failed for file ${file.name}`);
        reject(fileReader.error);
      };

      loadNext(chunkIndex);
    } catch (err) {
      // console.error(err);
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
                // console.error(
                //   `Failed to evaluate checksums of file ${file.name}`,
                // );
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

/**
 * Updates the bearer token used to send requests to the File-Upload API.
 *
 * @async
 * @function updateUploadToken
 * @param {string} fileName - The name of the file currently being uploaded.
 * @returns {Promise<void>} A promise that resolves when the token has been updated.
 *
 * @description
 * 1. This function decodes the current bearer token and extracts the last uploaded file name from the
 * token's scope.
 * 2. It then calls the auth service to refresh the bearer token if necessary,
 * and explicitly requests the auth service to provide a new token if the current token was generated for a different
 * file.
 * 3. It updates the upload service with the new token.
 *
 * @throws Will throw an error if the token refresh operation fails.
 */
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
  uploadService.setToken(uploadToken.value);
};

/**
 * Uploads a single chunk of a file. Retries to upload chunk upto 5 times in case of network errors.
 * @param {FormData} chunkData - The FormData object containing the chunk and its metadata.
 * @returns {Promise<boolean>} A promise that resolves to true if the chunk was uploaded successfully, false otherwise.
 */
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
      // console.error(`Encountered error uploading chunk`, e);
    }
    return chunkUploaded;
  };

  let retry_count = 0;
  let uploaded = false;
  while (!uploaded && !uploadCancelled.value) {
    // uploaded = true; // Placeholder: Replace with actual upload logic
    uploaded = await upload();
    if (!uploaded) {
      retry_count += 1;
    }
    if (retry_count > RETRY_COUNT_THRESHOLD) {
      // console.error(
      //   `Exceeded retry threshold of ${RETRY_COUNT_THRESHOLD} times`,
      // );
      break;
    }
  }

  return uploaded;
};

const getFileUploadLog = ({ name, path }) => {
  return datasetUploadLog.value.files.find((fileUploadLog) => {
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
    chunkData.append(
      "uploaded_entity_id",
      datasetUploadLog.value.audit_log.dataset.id,
    );
    chunkData.append(
      "upload_path",
      datasetUploadLog.value.audit_log.dataset.origin_path,
    );
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
  fileDetails.uploadStatus = Constants.UPLOAD_STATUSES.UPLOADING;

  const uploaded = await uploadFileChunks(fileDetails);
  if (!uploaded) {
    // console.error(`Upload of file ${fileDetails.name} failed`);
  }

  fileDetails.uploadStatus = uploaded
    ? Constants.UPLOAD_STATUSES.UPLOADED
    : Constants.UPLOAD_STATUSES.UPLOAD_FAILED;

  if (!uploaded) {
    if (selectingDirectory.value) {
      delete selectedDirectory.value.progress;
    } else if (selectingFiles.value) {
      delete fileDetails.progress;
    }
  }

  return uploaded;
};

/**
 * Handles the submission of the dataset upload form.
 * This function is called when the user clicks the "Upload" button on the final step of the stepper.
 *
 * @async
 * @function onSubmit
 *
 * @description
 * This function performs the following steps:
 * 1. Sets the submission attributes to indicate that an upload is in progress.
 * 2. Before initiating the upload, evaluates file checksums, and registers the Dataset to be uploaded in the database.
 * 3. Sequentially uploads any files that have not been uploaded yet.
 * 4. Once all files have been uploaded, or if the upload is interrupted, it sets appropriate error messages and status.
 *
 * @throws {Error} If there's an issue with dataset creation or file upload.
 *
 * @returns {Promise<void>}
 */
const onSubmit = async () => {
  if (filesToUpload.value.length === 0) {
    await setFormErrors();
    return Promise.reject();
  }

  submissionStatus.value = Constants.UPLOAD_STATUSES.PROCESSING;
  statusChipColor.value = "primary";
  submissionAlert.value = null; // reset any alerts from previous submissions
  isSubmissionAlertVisible.value = false;
  submitAttempted.value = true;

  return new Promise((resolve, reject) => {
    preUpload()
      .then(async () => {
        submissionSuccess.value = true;
        submissionStatus.value = Constants.UPLOAD_STATUSES.UPLOADING;

        const filesUploaded = await uploadFiles(filesNotUploaded.value);
        // const filesUploaded = true; // placeholder for actual upload logic
        if (filesUploaded) {
          resolve();
        } else {
          submissionStatus.value = Constants.UPLOAD_STATUSES.UPLOAD_FAILED;
          submissionAlert.value = "Some files could not be uploaded.";
          reject();
        }
      })
      .catch((err) => {
        console.error(err);
        submissionStatus.value = Constants.UPLOAD_STATUSES.PROCESSING_FAILED;
        submissionAlert.value =
          "There was an error. Please try submitting again.";
        reject();
      });
  });
};

const setPostSubmissionSuccessState = () => {
  if (!someFilesPendingUpload.value) {
    submissionStatus.value = Constants.UPLOAD_STATUSES.UPLOADED;
    statusChipColor.value = "primary";
    submissionAlertColor.value = "success";
    submissionAlert.value =
      "All files have been uploaded successfully. You may close this window.";
    isSubmissionAlertVisible.value = true;
  }
};

/**
 * Called when all files have been successfully uploaded, and a network request has been made
 * to initiate the `process_dataset_upload` workflow.
 */
const postSubmit = () => {
  if (uploadCancelled.value) {
    return;
  }

  setPostSubmissionSuccessState();

  const failedFileUpdates = filesNotUploaded.value.map((file) => {
    return {
      id: datasetUploadLog.value.files.find((f) => f.md5 === file.fileChecksum)
        .id,
      data: {
        status: Constants.UPLOAD_STATUSES.UPLOAD_FAILED,
      },
    };
  });

  if (datasetUploadLog.value) {
    createOrUpdateUploadLog({
      status: someFilesPendingUpload.value
        ? Constants.UPLOAD_STATUSES.UPLOAD_FAILED
        : Constants.UPLOAD_STATUSES.UPLOADED,
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
      return !uploadCancelled.value
        ? datasetService.processDatasetUpload(
          datasetUploadLog.value.audit_log.dataset.id,
        )
        : Promise.reject();
    })
    .catch((e) => {
      // console.error(e);
      submissionSuccess.value = false;
      statusChipColor.value = "warning";
      submissionAlert.value = "An error occurred.";
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
      submissionAlert.value = "At least one file must be selected";
      submissionAlertColor.value = "warning";
    } else {
      handleSubmit();
    }
  } else {
    nextStep();
  }
};

/**
 * This function:
 * 1. evaluates the checksums of the files to be uploaded.
 * 2. Logs any upload-related information that needs to be persisted in the database.
 */
const preUpload = async () => {
  await evaluateChecksums(filesNotUploaded.value);

  const logData = datasetUploadLog.value?.id
    ? {
      status: Constants.UPLOAD_STATUSES.UPLOADING,
    }
    : {
      ...uploadFormData.value,
    };

  try {
    const res = await createOrUpdateUploadLog(logData);
    datasetUploadLog.value = res.data;
    if ((datasetUploadLog.value.audit_log.dataset.projects || []).length > 0) {
      projectCreated.value =
        datasetUploadLog.value.audit_log.dataset.projects[0]?.project;
    }
  } catch (err) {
    // console.error(err);
    throw new Error("Error logging dataset upload");
  }
};

/**
 * Creates a log entry for this Dataset's upload in the database, or updates an existing log.
 * @param data
 */
const createOrUpdateUploadLog = (data) => {
  if (!uploadCancelled.value) {
    return !datasetUploadLog.value
      ? datasetService.logDatasetUpload(data)
      : datasetService.updateDatasetUploadLog(
        datasetUploadLog.value?.audit_log?.dataset.id,
        data,
      );
  } else {
    return Promise.reject();
  }
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

/**
 * Persists the details of the files selected for uploading in this component's state.
 *
 * @param {File[]} files - Array of File objects representing the files in the directory.
 */
const setFiles = (files) => {
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
};

/**
 * Persists the details of the files contained inside the directory selected for uploading in this component's state.
 *
 * @param {Object} directoryDetails - Details of the directory selected for uploading.
 * @param {File[]} directoryDetails.files - Array of File objects representing the files in the directory.
 * @param {string} directoryDetails.directoryName - The name of the directory has been selected for uploading.
 */
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
  };

  displayedFilesToUpload.value = [selectedDirectory.value];
};

// If a user is uploading a directory, the name of the Dataset to be uploaded will be pre-populated to be the same as
// the name of the directory they have selected for uploading.
watch(selectingDirectory, () => {
  if (selectingDirectory.value) {
    uploadedDatasetName.value = selectedDirectory.value.name;
  }
});

// If a user is uploading individual files, the name of the Dataset to be uploaded will be entered by them. Therefore,
// clear the name, if it is already pre-populated.
watch(selectingFiles, () => {
  if (selectingFiles.value) {
    uploadedDatasetName.value = "";
  }
});

/**
 * ## Instrument checkbox and selection behavior
 *
 * This section explains the behavior of the "Assign Source Instrument" checkbox and select fields.
 * The state is managed through refs, computed properties and watchers.
 *
 * Initial State:
 * - If no Instruments available to assign:
 *   - Checkbox is unchecked and disabled
 *   - Instrument select is disabled
 * - If Instrument is available to assign:
 *   - Checkbox is checked and enabled
 *   - Instrument select is enabled
 *
 * State changes:
 * - User interaction with checkbox:
 *    - If user unchecks:
 *      - Checkbox remains enabled
 *      - Search field becomes disabled
 *    - If user checks:
 *      - Checkbox remains enabled
 *      - Search field becomes enabled
 */
/**
 * `Assign Source Instrument` checkbox is disabled if:
 * - There are no Instrument options to choose from
 */
const isInstrumentsCheckboxDisabled = computed(() => {
  return noInstrumentsToAssign.value;
});
/**
 * Instrument selection is enabled if:
 * - `Assign Source Instrument` checkbox is enabled, AND
 * - `Assign Source Instrument` checkbox is checked
 */
const isInstrumentSelectionEnabled = computed(() => {
  return (
    !isInstrumentsCheckboxDisabled.value && willAssignSourceInstrument.value
  );
});
/**
 * `instrumentsCheckboxInternalState`: Internal checked/unchecked state for the `Assign Source Instrument` checkbox.
 * - Used as the default state of the checkbox
 * - Used to update the state of the checkbox
 */
const instrumentsCheckboxInternalState = ref(true);
/**
 * `willAssignSourceInstrument`: Determines whether the user wants to assign an Instrument to the Dataset being
 * uploaded.
 * - This is a writable Computed property that manages the checked/unchecked state of the 'Assign
 * Source Instruments' checkbox.
 *
 * @property {Function} get - Getter function for the checkbox state.
 *   - Returns `false` if there are no Instruments to choose from.
 *   - Otherwise, returns the internal checkbox state.
 *
 * @property {Function} set - Setter function for the checkbox state.
 *   - Updates the internal checkbox state only if there are some Instrument options to choose from.
 *
 * @returns {boolean} The current checked/unchecked state of the 'Assign Source Instrument' checkbox.
 */
const willAssignSourceInstrument = computed({
  get: () => {
    if (noInstrumentsToAssign.value) {
      return false;
    }
    return instrumentsCheckboxInternalState.value;
  },
  set: (newValue) => {
    if (!noInstrumentsToAssign.value) {
      instrumentsCheckboxInternalState.value = newValue;
    }
  },
});

/**
 * ## Project checkbox and search behavior
 *
 * This section explains the behavior of the "Assign Project" checkbox and search fields.
 * The state is managed through refs, computed properties and watchers.
 *
 * Initial State:
 * - If no Project available to assign:
 *   - Checkbox is unchecked and disabled
 *   - Project search is disabled
 * - If Project is available to assign:
 *   - Checkbox is checked and enabled
 *   - Project search is enabled
 *
 * State changes:
 * - User interaction with checkbox:
 *    - If user unchecks:
 *      - Checkbox remains enabled
 *      - Search field becomes disabled
 *    - If user checks:
 *      - Checkbox remains enabled
 *      - Search field becomes enabled
 */
/**
 * `Assign Project` checkbox is disabled if:
 * - There are no Project options to choose from
 */
const isProjectCheckboxDisabled = computed(() => {
  return noProjectsToAssign.value;
});
/**
 * Project search field is enabled if:
 * - `Assign Project` checkbox is enabled, AND
 * - `Assign Project` checkbox is checked
 */
const isProjectSearchEnabled = computed(() => {
  return !isProjectCheckboxDisabled.value && willAssignProject.value;
});
/**
 * `projectCheckboxInternalState`: Internal checked/unchecked state for the `Assign Project` checkbox.
 * - Used as the default state of the checkbox
 * - Used to update the state of the checkbox
 */
const projectCheckboxInternalState = ref(true);
/**
 * `willAssignProject` determines whether the user wants to assign a Project to the Dataset being uploaded.
 * - This is a writable Computed property that manages the checked/unchecked state of the 'Assign
 * Project' checkbox.
 *
 * @property {Function} get - Getter function for the checkbox state.
 *   - Returns `false` if there are no Projects to choose from.
 *   - Otherwise, returns the internal checkbox state.
 *
 * @property {Function} set - Setter function for the checkbox state.
 *   - Updates the internal checkbox state only if there are some Project option to choose from.
 *
 * @returns {boolean} The current checked/unchecked state of the 'Assign Project' checkbox.
 */
const willAssignProject = computed({
  get: () => {
    if (noProjectsToAssign.value) {
      return false;
    }
    return projectCheckboxInternalState.value;
  },
  set: (newValue) => {
    if (!noProjectsToAssign.value) {
      projectCheckboxInternalState.value = newValue;
    }
  },
});

/**
 * ## Source Raw Data checkbox and search behavior
 *
 * This section explains the behavior of the "Assign Raw Data" checkbox and search fields.
 * The state is managed through refs, computed properties and watchers.
 *
 * Initial State:
 * - If no Raw Data available to assign:
 *   - Checkbox is unchecked and disabled
 *   - Raw Data search is disabled
 * - If Raw Data is available to assign:
 *   - Checkbox is checked and enabled
 *   - Raw Data search is enabled
 *
 * State changes:
 * 1. When type of Dataset to be uploaded changes:
 *    - If new type is Raw Data:
 *      - Checkbox becomes unchecked and disabled (since a Raw Data cannot be assigned as the source of another Raw
 *      Data)
 *      - Search field is disabled
 *    - If new type is not Raw Data:
 *      - Checkbox becomes checked and enabled
 *      - Search field is enabled
 * 2. User interaction with checkbox:
 *    - If user unchecks:
 *      - Checkbox remains enabled
 *      - Search field becomes disabled
 *    - If user checks:
 *      - Checkbox remains enabled
 *      - Search field becomes enabled
 */
/**
 * `Assign Raw Data` checkbox is disabled if:
 * - There are no Raw Data options to choose from, OR,
 * - The Dataset being uploaded is a Raw Data
 */
const isRawDataCheckboxDisabled = computed(() => {
  return noRawDataToAssign.value || willUploadRawData.value;
});
/**
 * Raw Data search field is enabled if:
 * - `Assign Raw Data` checkbox is enabled, AND,
 * - `Assign Raw Data` checkbox is checked
 */
const isRawDataSearchEnabled = computed(() => {
  return !isRawDataCheckboxDisabled.value && willAssignSourceRawData.value;
});
/**
 * `rawDataCheckboxInternalState`: Internal checked/unchecked state for the `Assign Raw Data` checkbox.
 * - Used as the default state of the checkbox
 * - Used to update the state of the checkbox
 */
const rawDataCheckboxInternalState = ref(true);
/**
 * `willAssignSourceRawData` determines whether the user wants to assign a source Raw Data to the Dataset being
 * uploaded.
 * - This is a writable Computed property that manages the checked/unchecked state of the 'Assign
 * Raw Data' checkbox.
 *
 * @property {Function} get - Getter function for the checkbox state.
 *   - Returns `false` if there are no Raw Data to choose from, or if the type of the Dataset being uploaded is a Raw
 *   Data.
 *   - Otherwise, returns the internal checkbox state.
 *
 * @property {Function} set - Setter function for the checkbox state.
 *   - Updates the internal checkbox state only if there are some Raw Data options to choose from,
 *   and the type of the Dataset being uploaded is not a Raw Data.
 *
 * @returns {boolean} The current checked/unchecked state of the 'Assign Raw Data' checkbox.
 */
const willAssignSourceRawData = computed({
  get: () => {
    if (noRawDataToAssign.value || willUploadRawData.value) {
      return false;
    }
    return rawDataCheckboxInternalState.value;
  },
  set: (newValue) => {
    if (!noRawDataToAssign.value && !willUploadRawData.value) {
      rawDataCheckboxInternalState.value = newValue;
    }
  },
});
/**
 * Handler for when the type of the Dataset to be uploaded changes.
 * - Resets the search query for the Raw Data search field
 * - Updates the internal state of the `Assign Raw Data` checkbox to `true` (checked) if:
 *   - The Dataset to be uploaded is not of type Raw Data, AND
 *   - There are Raw Data options to choose from for assignment to the uploaded Dataset
 */
watch(selectedDatasetType, () => {
  resetRawDataSearch();
  if (!willUploadRawData.value && !noRawDataToAssign.value) {
    rawDataCheckboxInternalState.value = true;
  }
});

// Form errors are set when this component mounts, or when a form field's value
// changes, or when the current step changes.
watch(
  [
    step,
    uploadedDatasetName,
    projectSelected,
    willAssignProject,
    selectedRawData,
    willAssignSourceRawData,
    selectedSourceInstrument,
    willAssignSourceInstrument,
    selectingFiles,
    selectingDirectory,
    filesToUpload,
  ],
  async (newVals, oldVals) => {
    // Mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    if (stepKey === STEP_KEYS.UPLOAD) {
      // `1` corresponds to `uploadedDatasetName`
      stepPristineStates.value[step.value][stepKey] = !oldVals[1] && newVals[1];
    } else {
      stepPristineStates.value[step.value][stepKey] = false;
    }

    await setFormErrors();
  },
);

/**
 * When first mounted, load the resources which will be needed in the rest of the form.
 * - Load resources are:
 *  - A list of Instruments that Datasets originate from
 *  - A list of Raw Data that may be assigned to the Dataset being uploaded
 *  - A list of Projects that may be assigned to the Dataset being uploaded
 *
 *  Only a subset of the entirety of the Raw Data and Projects available to the user for assignment are loaded at this
 *  point. If a user has access to more Raw Data and Projects to choose from, they will be lazily-loaded later.
 *  This initial load of a subset of options is done only to permanently disable the "Raw Data" and "Project"
 *  search fields if the user has zero options to choose from.
 */
onMounted(async () => {
  loading.value = true;

  try {
    // Load Instruments that will be available for assignment to the Dataset being uploaded.
    const onLoadInstrumentResponse = await instrumentService.getAll();
    sourceInstrumentOptions.value = onLoadInstrumentResponse.data;
    noInstrumentsToAssign.value = sourceInstrumentOptions.value.length === 0;

    // Do an initial load of Raw Data to verify whether the user has access to any Raw Data to choose from for
    // assignment to the Dataset being uploaded. If not, the `Assign Raw Data` checkbox will always be disabled.
    const onLoadRawDataOptionsResponse = await datasetService.getAll({
      type: config.dataset.types.RAW_DATA.key,
    });
    noRawDataToAssign.value =
      onLoadRawDataOptionsResponse.data.datasets.length === 0;

    // Do an initial load of Projects to verify whether the user has access to any Projects to choose from for
    // assignment to the Dataset being uploaded. If not, the `Assign Project` checkbox will always be disabled.
    const onLoadProjectOptionsResponse = await projectService.getAll({
      forSelf: !(auth.canOperate || auth.canAdmin),
    });
    noProjectsToAssign.value =
      onLoadProjectOptionsResponse.data.projects.length === 0;
  } catch (error) {
    console.error("Error loading resources:", error);
    toast.error("An error occurred. Please refresh the page to try again.");
  }

  loading.value = false;
});

/**
 * Evaluate form-validation errors when first mounted, to make sure any form-buttons are disabled until all
 * form-validations are passing.
 */
onMounted(() => {
  setFormErrors();
});

/**
 * Route Change Handling Mechanism
 *
 * This mechanism is designed to handle the scenario when a user attempts to navigate away from the current page
 * while the upload is incomplete. It uses Vue Router's navigation guards and component lifecycle hooks
 * to prompt the user for confirmation and cancel the upload if necessary.
 *
 * Key Components:
 *
 * 1. `isUploadIncomplete`:
 *    A computed property that determines if the upload is still in progress or incomplete.
 *
 * 2. `onBeforeRouteLeave`:
 *    Navigation guard triggered when the user attempts to navigate to a different route.
 *    It shows a browser confirmation dialog if the upload is incomplete.
 *
 * 3. `onBeforeUnmount`:
 *    Lifecycle hook triggered when the component is about to be unmounted (which happens during navigation).
 *    It cancels the upload if it's incomplete.
 *
 * 4. `uploadCancelled`:
 *    A reactive variable used to signal that the upload should be considered cancelled.
 *
 * Flow:
 * 1. User attempts to navigate to a different route
 * 2. `onBeforeRouteLeave` is triggered
 *    - If upload is incomplete, shows a confirmation dialog
 *    - If user confirms, allows navigation; if user cancels, prevents navigation
 * 3. If navigation is allowed, `onBeforeUnmount` is triggered
 *    - Sets `uploadCancelled` to true
 *    - If upload is incomplete, sends a request to cancel the upload
 *
 */
onBeforeRouteLeave(() => {
  // Before navigating to a different route, show user a confirmation dialog
  return isUploadIncomplete.value
    ? window.confirm(
      "Leaving this page before all files have been uploaded will" +
      " cancel the upload. Do you wish to continue?",
    )
    : true;
});

onBeforeUnmount(() => {
  uploadCancelled.value = true;
  if (isUploadIncomplete.value && datasetUploadLog.value) {
    datasetService.cancelDatasetUpload(
      datasetUploadLog.value.audit_log.dataset.id,
    );
  }
});

/**
 * Browser Tab Closure Handling Mechanism
 *
 * This handler is triggered when the user attempts to close the browser tab or navigate away from the page.
 * It shows a browser alert to confirm the user's intention if an upload is in progress.
 *
 * @description
 * - Checks if an upload is incomplete using the `isUploadIncomplete` computed property.
 * - If an upload is incomplete:
 *   - Sets the `returnValue` of the event to `true`, which prompts the browser to show a confirmation dialog.
 * - This prevents accidental data loss by giving the user a chance to confirm before leaving the page during an
 * upload.
 *
 */
const onBeforeUnload = (e) => {
  if (isUploadIncomplete.value) {
    e.returnValue = true;
  }
};

onMounted(() => {
  window.addEventListener("beforeunload", onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
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
    // min-height: 0 to shrink the element to below its calculated min-height of children
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
    height: 400px;
    max-height: 400px;
  }
}
</style>
