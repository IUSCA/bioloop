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

      <!-- Step 0 (File selector) -->
      <template #step-content-0>
        <div class="flex flex-col" data-testid="step-content-0">
          <!-- Buttons to select the files/directory to upload -->
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

      <!-- Step 1: Metadata ('General Info') -->
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
            <va-popover
              data-testid="upload-metadata-dataset-autocomplete-popover"
            >
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
            <va-popover
              data-testid="upload-metadata-project-autocomplete-popover"
            >
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
              <va-popover
                data-testid="upload-metadata-source-instrument-popover"
              >
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

      <!-- Step 2: Start Upload / Upload Details -->
      <template #step-content-2>
        <!-- Always show two cards: Left (metadata with dataset name) and Right (file list with upload progress) -->
        <div class="flex flex-row" v-if="selectingFiles || selectingDirectory">
          <!-- LEFT CARD: Dataset Metadata -->
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
                  v-model:populated-dataset-name="uploadedDatasetName"
                  :dataset="datasetUploadLog?.dataset"
                  :selected-dataset-type="selectedDatasetType.value"
                  :input-disabled="submitAttempted"
                  :dataset-name-error="
                    !stepIsPristine ? formErrors[STEP_KEYS.UPLOAD] : ''
                  "
                  :project="projectSelected"
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

          <!-- RIGHT CARD: File List and Upload Progress -->
          <div class="flex-1">
            <va-card>
              <va-card-title>{{
                isUploadComplete ? "Files Uploaded" : "Files to Upload"
              }}</va-card-title>
              <va-card-content>
                <!-- Upload progress (always shown, above file list) -->
                <div
                  class="mb-4 pb-4 border-b border-gray-300 flex flex-col gap-3"
                >
                  <!-- Manifest-hash computation progress — amber/warning treatment -->
                  <div
                    v-if="isComputingChecksum"
                    class="rounded-md px-3 py-2 border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20"
                  >
                    <div
                      class="flex items-center gap-2 text-sm font-semibold mb-2 text-amber-700 dark:text-amber-400"
                    >
                      <Icon
                        icon="mdi:fingerprint"
                        class="text-base flex-none"
                      />
                      <span
                        >Computing manifest-hash… {{ checksumProgress }}%</span
                      >
                    </div>
                    <va-progress-bar
                      :model-value="checksumProgress"
                      color="warning"
                    />
                  </div>

                  <!-- Overall upload progress — primary treatment -->
                  <div
                    class="rounded-md px-3 py-2 border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10"
                  >
                    <div
                      class="flex items-center gap-2 text-sm font-semibold mb-2 text-blue-700 dark:text-blue-400"
                    >
                      <Icon
                        icon="mdi:cloud-upload-outline"
                        class="text-base flex-none"
                      />
                      <span>
                        {{
                          submitAttempted && !isComputingChecksum
                            ? `Uploading… ${filesUploaded} / ${totalFiles} files (${uploadProgress}%)`
                            : isComputingChecksum
                              ? "Upload queued"
                              : "Upload Progress: Not started"
                        }}
                      </span>
                    </div>
                    <va-progress-bar
                      :model-value="
                        submitAttempted && !isComputingChecksum
                          ? uploadProgress
                          : 0
                      "
                      :color="
                        submitAttempted && !isComputingChecksum
                          ? 'primary'
                          : 'secondary'
                      "
                    />
                  </div>

                  <!-- Per-file failure summary — only shown when one or more files failed -->
                  <div
                    v-if="fileUploadErrors.length > 0"
                    class="rounded-md px-3 py-2 border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
                  >
                    <div
                      class="flex items-center gap-2 text-sm font-semibold mb-2 text-red-700 dark:text-red-400"
                    >
                      <Icon
                        icon="mdi:alert-circle-outline"
                        class="text-base flex-none"
                      />
                      <span
                        >{{ fileUploadErrors.length }} file{{
                          fileUploadErrors.length === 1 ? "" : "s"
                        }}
                        failed to upload</span
                      >
                    </div>
                    <ul
                      class="text-xs text-red-700 dark:text-red-300 space-y-1 max-h-32 overflow-y-auto"
                    >
                      <li
                        v-for="err in fileUploadErrors"
                        :key="err.relativePath"
                        class="flex items-start gap-1"
                      >
                        <Icon
                          icon="mdi:close-circle"
                          class="flex-none mt-0.5"
                        />
                        <span class="break-all">{{ err.relativePath }}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- File list -->
                <div
                  class="file-list"
                  style="max-height: 400px; overflow-y: auto"
                >
                  <div
                    v-for="file in displayedFilesToUpload"
                    :key="file.name"
                    class="mb-2 pb-2 border-b border-gray-200 last:border-b-0"
                  >
                    <div class="flex items-center justify-between">
                      <span class="truncate flex-grow mr-2">{{
                        file.name
                      }}</span>
                      <div class="flex items-center gap-1.5 flex-none">
                        <!-- Upload-complete check (all succeeded, no per-file tracking needed) -->
                        <Icon
                          v-if="
                            isUploadComplete && fileUploadErrors.length === 0
                          "
                          icon="mdi:check-circle"
                          class="text-green-500 text-base"
                        />
                        <!-- Per-file failure indicator -->
                        <Icon
                          v-else-if="
                            fileUploadErrorMap.has(
                              file.webkitRelativePath || file.name,
                            )
                          "
                          icon="mdi:close-circle"
                          class="text-red-500 text-base"
                        />
                        <span class="text-sm text-gray-500 whitespace-nowrap">{{
                          file.formattedSize
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </va-card-content>
            </va-card>
          </div>
        </div>
      </template>

      <!-- custom controls -->
      <template #controls="{ nextStep, prevStep }">
        <div class="flex items-center justify-around w-full">
          <!-- Previous button -->
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
          <!-- Next / Upload / Retry buttons -->
          <div class="flex-none" data-testid="upload-next-button">
            <va-button
              v-if="uploadRegistrationFailed"
              @click="retryApiCall"
              color="warning"
            >
              Retry
            </va-button>
            <va-button
              v-else
              @click="onNextClick(nextStep)"
              :color="isLastStep ? 'success' : 'primary'"
              :disabled="isNextButtonDisabled"
            >
              {{ isLastStep ? "Upload" : "Next" }}
            </va-button>
          </div>
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
import { _getUploadServiceURL } from "@/services/upload";
import {
  computeManifestHash,
  isChecksumVerificationEnabled,
} from "@/services/upload/checksum";
import { formatBytes } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import { Icon } from "@iconify/vue";
import _ from "lodash";
import * as tus from "tus-js-client";
import { VaDivider, VaPopover } from "vuestic-ui";

const auth = useAuthStore();

const STEP_KEYS = {
  SELECT_FILES: "selectFiles",
  GENERAL_INFO: "generalInfo",
  UPLOAD: "upload",
};

// Various errors that may be shown to the user during the process of uploading a dataset.
const UNKNOWN_VALIDATION_ERROR = "An unknown error occurred";
const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";
const DATASET_NAME_HAS_SPACES_ERROR = "Dataset name cannot contain spaces";
const DATASET_NAME_MIN_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";

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
  [STEP_KEYS.SELECT_FILES]: null,
  [STEP_KEYS.GENERAL_INFO]: null,
  [STEP_KEYS.UPLOAD]: null,
});

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
  { [STEP_KEYS.SELECT_FILES]: true },
  { [STEP_KEYS.GENERAL_INFO]: true },
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

// Upload progress state
const uploadProgress = ref(0);
const filesUploaded = ref(0);
const totalFiles = ref(0);
const lastUploadProcessId = ref(null); // A TUS process_id from this batch — sent to /complete as audit reference only
// Limit concurrent TUS uploads to avoid exhausting browser/network resources
// when a directory contains many files.
const MAX_CONCURRENT_TUS_UPLOADS = Math.max(
  1,
  parseInt(config.upload.max_concurrent_files, 10) || 4,
);

// Per-file failure tracking — populated after upload; each entry:
// { name: string, relativePath: string, message: string }
const fileUploadErrors = ref([]);
// O(1) lookup: relativePath → error message, for the file-list status icons
const fileUploadErrorMap = computed(
  () => new Map(fileUploadErrors.value.map((e) => [e.relativePath, e.message])),
);
const uploadRegistrationFailed = ref(false); // Track if final API call failed
const isComputingChecksum = ref(false); // Track manifest-hash computation state
const checksumProgress = ref(0); // Track manifest-hash computation progress (0-100)
const computedChecksum = ref(null); // Store computed manifest-hash payload before upload

/**
 * Computed: Determine if upload completed successfully
 * Used to show success indicators and change UI text from "Files to Upload" to "Files Uploaded"
 *
 * Success condition: When files are uploaded AND registered with API successfully
 * This is indicated by:
 * - statusChipColor is "success" (set in handleUploadComplete after successful API registration)
 * - OR submissionAlertColor is "success" with alert visible
 */
const isUploadComplete = computed(() => {
  return (
    statusChipColor.value === "success" ||
    (submissionAlertColor.value === "success" && isSubmissionAlertVisible.value)
  );
});

/**
 * Determines if the upload process has been completed.
 *
 * An upload is considered complete if `submissionStatus` has been set to `UPLOADED`. This occurs when:
 * - All files have been uploaded
 * - The upload has been registered with the API (process_id recorded)
 */
const isUploadIncomplete = computed(() => {
  return (
    submitAttempted.value &&
    submissionStatus.value !== Constants.UPLOAD_STATUSES.UPLOADED
  );
});

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

const filesNotUploaded = computed(() => {
  return filesToUpload.value.filter(
    (e) => e.uploadStatus !== Constants.UPLOAD_STATUSES.UPLOADED,
  );
});

const someFilesPendingUpload = computed(
  () => filesNotUploaded.value.length > 0,
);

const uploadFormData = computed(() => {
  return {
    name: uploadedDatasetName.value,
    type: selectedDatasetType.value["value"],
    ...(selectedRawData.value && {
      src_dataset_id: selectedRawData.value.id,
    }),
    ...(projectSelected.value &&
      !willCreateNewProject.value && { project_id: projectSelected.value.id }),
    ...(projectSelected.value &&
      !willCreateNewProject.value && { project_id: projectSelected.value.id }),
    ...(selectedSourceInstrument.value && {
      src_instrument_id: selectedSourceInstrument.value.id,
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
  const oversized = Array.from({ length: files.length }, (_, i) =>
    files.item(i),
  ).filter((f) => f.size > config.upload.max_file_size_bytes);
  if (oversized.length > 0) {
    submissionAlert.value = `${oversized.map((f) => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the ${formatBytes(config.upload.max_file_size_bytes)} per-file size limit.`;
    submissionAlertColor.value = "danger";
    isSubmissionAlertVisible.value = true;
    return;
  }
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
  const oversized = Array.from(directoryDetails.files).filter(
    (f) => f.size > config.upload.max_file_size_bytes,
  );
  if (oversized.length > 0) {
    submissionAlert.value = `${oversized.map((f) => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the ${formatBytes(config.upload.max_file_size_bytes)} per-file size limit.`;
    submissionAlertColor.value = "danger";
    isSubmissionAlertVisible.value = true;
    return;
  }
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
const clearSelectedDirectoryToUpload = ({
  clearDirectoryFiles = true,
} = {}) => {
  // clear files within the directory being removed
  if (clearDirectoryFiles) {
    clearSelectedFilesToUpload();
  }
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
    [STEP_KEYS.SELECT_FILES]: null,
    [STEP_KEYS.GENERAL_INFO]: null,
    [STEP_KEYS.UPLOAD]: null,
  };
};

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
  fileUploadErrors.value = [];

  return new Promise((resolve, reject) => {
    preUpload()
      .then(async () => {
        submissionSuccess.value = true;

        // COMPUTE MANIFEST-HASH FIRST (before upload starts)
        // Skip if already computed (e.g., on retry after upload failure)
        if (isChecksumVerificationEnabled() && !computedChecksum.value) {
          try {
            isComputingChecksum.value = true;
            checksumProgress.value = 0;
            submissionStatus.value =
              Constants.UPLOAD_STATUSES.COMPUTING_CHECKSUMS;

            const files = filesToUpload.value.map((f) => f.file);
            computedChecksum.value = await computeManifestHash(
              files,
              (progress) => {
                checksumProgress.value = progress;
              },
            );
          } catch (error) {
            // computeManifestHash catches internally and returns a skip-marker.
            // This outer catch is a safety net for any unexpected escape.
            // Record the skip-marker so the worker knows computation was attempted
            // (as opposed to feature-disabled / legacy), and doesn't retry on
            // subsequent upload attempts.
            console.error(
              "[UploadDatasetStepper] Unexpected error during manifest-hash computation:",
              error,
            );
            computedChecksum.value = {
              skipped: true,
              skipped_reason: "client_computation_failed",
              error: String(error),
            };
          } finally {
            isComputingChecksum.value = false;
            checksumProgress.value = 0;
          }
        }

        // NOW START UPLOAD
        submissionStatus.value = Constants.UPLOAD_STATUSES.UPLOADING;

        const filesToUploadList = filesToUpload.value.map((f) => f.file);

        totalFiles.value = filesToUploadList.length;
        filesUploaded.value = 0;
        uploadProgress.value = 0;

        const uploadServiceURL = _getUploadServiceURL(window.location.origin);
        const uploaded = await uploadFilesWithTus(
          filesToUploadList,
          uploadServiceURL,
        );

        if (uploaded) {
          handleUploadComplete();
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
 * Called when all files have been successfully uploaded, and the upload has been registered
 * with the API. The integrated workflow will be triggered by the polling job.
 */
const postSubmit = () => {
  if (uploadCancelled.value) {
    return;
  }

  // TUS handles file tracking internally, no need to update individual file statuses
  // Just set the overall success state
  setPostSubmissionSuccessState();
};

const handleSubmit = () => {
  onSubmit() // resolves once all files have been uploaded
    .then(() => {
      // Upload complete - handleUploadComplete() already triggered the workflow
      // Nothing more to do here
    })
    .catch(() => {
      submissionSuccess.value = false;
      statusChipColor.value = "warning";
      // Only set a generic fallback if onSubmit() didn't already set a more
      // specific message.  submissionAlert is reset to null at the start of
      // each submission attempt, so any non-null value here was deliberately
      // written by the failing code path and should be preserved.
      if (!submissionAlert.value) {
        submissionAlert.value = "An error occurred.";
        submissionAlertColor.value = "warning";
      }
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
 * This function logs any upload-related information that needs to be persisted in the database.
 */
const preUpload = async () => {
  // Create or update the upload log

  const isUpdate = !!datasetUploadLog.value?.id;
  const logData = isUpdate
    ? {
        status: Constants.UPLOAD_STATUSES.UPLOADING,
      }
    : {
        ...uploadFormData.value,
      };

  try {
    const res = await createOrUpdateUploadLog(logData);
    datasetUploadLog.value = res.data;
  } catch (err) {
    throw new Error("Error logging dataset upload");
  }
};

/**
 * Creates a log entry for this Dataset's upload in the database, or updates an existing log.
 * @param data
 */
const createOrUpdateUploadLog = (data) => {
  if (!uploadCancelled.value) {
    const isCreate = !datasetUploadLog.value;
    return isCreate
      ? datasetService.logDatasetUpload(data)
      : datasetService.updateDatasetUploadLog(
          datasetUploadLog.value?.dataset?.id,
          data,
        );
  } else {
    return Promise.reject();
  }
};

// TUS upload logic
const uploadFilesWithTus = async (files, endpoint) => {
  // Safety check: ensure upload log exists
  if (!datasetUploadLog.value || !datasetUploadLog.value.dataset) {
    console.error("Dataset upload log not initialized");
    throw new Error("Dataset upload log not initialized");
  }

  // Get token directly from localStorage (more reliable than Pinia store in this context)
  const userToken = localStorage.getItem("token");
  if (!userToken) {
    throw new Error("Authentication token not found");
  }

  let uploadedCount = 0;
  let totalBytes = 0;
  let uploadedBytes = 0;
  const failureStatusHistogram = {};
  const failureMessageHistogram = {};

  const bumpCounter = (counter, key) => {
    const normalizedKey = String(key ?? "unknown");
    counter[normalizedKey] = (counter[normalizedKey] || 0) + 1;
  };

  // Calculate total size
  files.forEach((file) => {
    totalBytes += file.size;
  });

  // TEST ONLY: Check if we should simulate mid-upload failure
  // Set localStorage.setItem('SIMULATE_UPLOAD_FAILURE', 'mid-upload') to enable
  // Set localStorage.setItem('SIMULATE_UPLOAD_FAILURE_COUNT', '5') to fail 5 times
  const simulateFailure = localStorage.getItem("SIMULATE_UPLOAD_FAILURE");
  const uploadSingleFileWithTus = (file) => {
    return new Promise((resolve, reject) => {
      // TEST ONLY: Check for failure count configuration
      // Set localStorage.setItem('SIMULATE_UPLOAD_FAILURE_COUNT', '5') to fail 5 times (exhausts retries)
      const simulateFailureCount = localStorage.getItem(
        "SIMULATE_UPLOAD_FAILURE_COUNT",
      );

      let upload = null;

      // No hard wall-clock timeout: TUS is designed for large resumable uploads
      // (up to 100 GB). Failure handling is fully delegated to the retry schedule
      // below — onError fires only after all retryDelays are exhausted, at which
      // point the upload is considered permanently failed.
      upload = new tus.Upload(file, {
        endpoint,
        // Do not persist per-file resume fingerprints in localStorage.
        // Large upload sessions can exceed browser storage quota and abort
        // uploads with QuotaExceededError before PATCH begins. 
        // ** NOTE: **
        // Setting storeFingerprintForResuming: false affects 
        // *persistent* resume (the feature that survives page reload/browser 
        // restart), because tus-js no longer stores fingerprint→upload URL 
        // in localStorage.
        storeFingerprintForResuming: false,
        // Send each file as bounded PATCH chunks so upstream proxies with
        // request-size limits (e.g. 100M) do not reject larger files with 413.
        chunkSize: config.upload.tus_chunk_size_bytes,
        // Fibonacci-progression retry delays (~16 min of cumulative back-off).
        // Start above 0 ms so a retried PATCH does not immediately race a lock
        // held by the prior in-flight request on the same upload resource.
        // tus-js-client retries automatically on retryable errors; onError is
        // called only once all retries are exhausted.
        retryDelays: [
          1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000, 55000, 89000,
          144000, 233000, 377000,
        ],
        onShouldRetry: (err, retryAttempt, options) => {
          const status = err?.originalResponse?.getStatus?.();
          const body = err?.originalResponse?.getBody?.();
          console.error("[TUS-CLIENT] Retry decision", {
            file_name: file.name,
            retry_attempt: retryAttempt,
            status,
            body,
            error_message: err?.message,
            error_type: err?.constructor?.name,
          });

          // Preserve tus-js-client default retry behavior after logging.
          return tus.defaultOptions.onShouldRetry(err, retryAttempt, options);
        },
        metadata: {
          dataset_id: String(datasetUploadLog.value.dataset.id),
          filename: file.name,
          filetype: file.type || "application/octet-stream",
          selection_mode: selectingDirectory.value ? "directory" : "files",
          relative_path:
            selectingDirectory.value && file.webkitRelativePath
              ? file.webkitRelativePath.split("/").slice(1).join("/")
              : file.webkitRelativePath || file.name,
          directory_name:
            selectingDirectory.value && selectedDirectory.value
              ? selectedDirectory.value.name
              : "",
        },
        headers: {
          Authorization: `Bearer ${userToken}`,
          ...(simulateFailure
            ? {
                "X-Simulate-Failure": simulateFailure,
                ...(simulateFailureCount
                  ? { "X-Simulate-Failure-Count": simulateFailureCount }
                  : {}),
              }
            : {}),
        },
        onBeforeRequest: (req) => {
          try {
            console.log("[TUS-CLIENT] Request", {
              file_name: file.name,
              method: req?.getMethod?.(),
              url: req?.getURL?.(),
            });
          } catch (hookErr) {
            console.error("[TUS-CLIENT] onBeforeRequest hook error", {
              file_name: file.name,
              error: hookErr?.message,
            });
          }
        },
        onAfterResponse: (req, res) => {
          try {
            console.log("[TUS-CLIENT] Response", {
              file_name: file.name,
              method: req?.getMethod?.(),
              url: req?.getURL?.(),
              status: res?.getStatus?.(),
              upload_offset: res?.getHeader?.("Upload-Offset"),
              upload_length: res?.getHeader?.("Upload-Length"),
              tus_resumable: res?.getHeader?.("Tus-Resumable"),
            });
          } catch (hookErr) {
            console.error("[TUS-CLIENT] onAfterResponse hook error", {
              file_name: file.name,
              error: hookErr?.message,
            });
          }
        },
        onChunkComplete: (chunkSize, bytesUploaded, bytesTotal) => {
          console.log("[TUS-CLIENT] Chunk complete", {
            file_name: file.name,
            chunk_size: chunkSize,
            bytes_uploaded: bytesUploaded,
            bytes_total: bytesTotal,
          });
        },
        onError: (error) => {
          const statusCode = error.originalResponse?.getStatus?.() ?? "unknown";
          const statusText = error.originalResponse?.getBody?.() || error.message || "unknown";
          bumpCounter(failureStatusHistogram, statusCode);
          bumpCounter(failureMessageHistogram, statusText);
          console.error(`[TUS-CLIENT] Upload FAILED for ${file.name}:`, {
            error_message: error.message,
            error_type: error.constructor.name,
            error_stack: error.stack,
            file_name: file.name,
            file_size: file.size,
            dataset_id: datasetUploadLog.value.dataset.id,
            upload_url: upload.url,
            // Check if it's an HTTP error
            originalRequest: error.originalRequest
              ? {
                  method: error.originalRequest.getMethod(),
                  url: error.originalRequest.getURL(),
                  status: error.originalResponse?.getStatus(),
                  statusText: error.originalResponse?.getBody(),
                }
              : null,
          });
          reject(error);
        },
        onProgress: (bytesUploaded) => {
          // Update overall progress
          const totalUploadedSoFar = uploadedBytes + bytesUploaded;
          uploadProgress.value = Math.round(
            (totalUploadedSoFar / totalBytes) * 100,
          );
        },
        onSuccess: async () => {
          uploadedCount++;
          uploadedBytes += file.size;
          filesUploaded.value = uploadedCount;
          uploadProgress.value = Math.round((uploadedBytes / totalBytes) * 100);

          // Record any one process_id for the /complete call (audit reference only;
          // file moving is handled server-side in the onUploadFinish TUS hook).
          lastUploadProcessId.value = upload.url.split("/").pop();

          resolve();
        },
      });

      upload.start();
    });
  };

  // Run uploads with a bounded pool instead of launching every file at once.
  // This prevents browser-level socket/request exhaustion on large directories.
  const workerCount = Math.min(MAX_CONCURRENT_TUS_UPLOADS, files.length);
  const results = new Array(files.length);
  let nextFileIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextFileIndex < files.length) {
      const fileIndex = nextFileIndex++;
      const file = files[fileIndex];
      try {
        await uploadSingleFileWithTus(file);
        results[fileIndex] = { status: "fulfilled" };
      } catch (error) {
        results[fileIndex] = { status: "rejected", reason: error };
      }
    }
  });

  await Promise.all(workers);

  const rejections = results
    .map((r, i) => ({ result: r, file: files[i] }))
    .filter(({ result }) => result.status === "rejected");

  if (rejections.length > 0) {
    fileUploadErrors.value = rejections.map(({ result, file }) => ({
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      message: result.reason?.message || "Upload failed",
    }));
    console.error("[TUS-CLIENT] Some uploads failed:", {
      total_files: files.length,
      failed_count: rejections.length,
      uploaded_count: uploadedCount,
      failed_files: fileUploadErrors.value.map((e) => e.relativePath),
    });
    console.error("[TUS-CLIENT] Failure summary (status/message histogram):", {
      status_histogram: failureStatusHistogram,
      top_messages: Object.entries(failureMessageHistogram)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    });
    return false;
  }

  return true;
};

const buildSizeManifest = (files) => {
  const normalized = files.map((file) => {
    const relativePath = file.webkitRelativePath
      ? file.webkitRelativePath
          .replace(/\\/g, "/")
          .split("/")
          .slice(1)
          .join("/")
      : file.name.replace(/\\/g, "/").replace(/^\.\//, "");
    return {
      path: relativePath,
      size: file.size,
    };
  });

  normalized.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    mode: "path-size-v1",
    file_count: normalized.length,
    total_size: normalized.reduce((sum, f) => sum + f.size, 0),
    files: normalized,
  };
};

const handleUploadComplete = async () => {
  // Files are already at origin_path — the TUS onUploadFinish hook moved each
  // file as it completed.  This call just records the final status + metadata.
  try {
    const datasetId = datasetUploadLog.value.dataset.id;

    const sizeManifest = buildSizeManifest(
      filesToUpload.value.map((f) => f.file),
    );
    const metadataPayload = {
      size_manifest: sizeManifest,
      ...(computedChecksum.value ? { checksum: computedChecksum.value } : {}),
    };

    const completePayload = {
      process_id: lastUploadProcessId.value,
      metadata: metadataPayload,
    };

    await datasetService.completeDatasetUpload(datasetId, completePayload);

    // Success - show green status
    uploadRegistrationFailed.value = false;
    submissionStatus.value = Constants.UPLOAD_STATUSES.UPLOADED;
    statusChipColor.value = "success";
    submissionAlert.value = "All files have been uploaded successfully!";
    submissionAlertColor.value = "success";
    isSubmissionAlertVisible.value = true;
    submissionSuccess.value = true;
  } catch (error) {
    console.error("[UPLOAD-COMPLETE] API call FAILED:", {
      error_message: error.message,
      error_response: error.response?.data,
      error_status: error.response?.status,
      error_stack: error.stack,
      dataset_id: datasetUploadLog.value?.dataset?.id,
    });

    // API call failed - show retry option
    uploadRegistrationFailed.value = true;
    submissionStatus.value = Constants.UPLOAD_STATUSES.UPLOAD_FAILED;
    statusChipColor.value = "warning";
    submissionAlert.value =
      "Files uploaded but registration failed. Please retry.";
    submissionAlertColor.value = "warning";
    isSubmissionAlertVisible.value = true;
    submissionSuccess.value = false;
  }
};

// Retry the API call to register the upload
const retryApiCall = async () => {
  submissionAlert.value = "Retrying ...";
  submissionAlertColor.value = "info";
  await handleUploadComplete();
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
 * to prompt the user for confirmation and to mark the upload as cancelled if necessary.
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
 *    It marks the upload as cancelled if it's incomplete.
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
 *    - If upload is incomplete, marks the upload as cancelled
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
  // Upload cleanup will be handled by background monitoring process
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
 * - This prevents accidental data loss by giving the user a chance to confirm before leaving the page during an upload.
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
    min-height: 400px;
  }
}
</style>
