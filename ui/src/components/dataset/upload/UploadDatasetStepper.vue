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

          <va-divider />

          <SelectedFilesTable
            @file-removed="removeFile"
            :files="displayedFilesToUpload"
          />
        </div>
      </template>

      <template #step-content-1>
        <div class="flex w-full pb-6 items-center">
          <va-select
            v-model="selectedDatasetType"
            :text-by="'label'"
            :track-by="'value'"
            :options="datasetTypeOptions"
            label="Dataset Type"
            placeholder="Select dataset type"
            class="flex-grow"
          />
          <div class="flex items-center ml-2">
            <va-popover>
              <template #body>
                <div class="w-96">
                  Raw Data: Original, unprocessed data collected from
                  instruments.
                  <br />
                  Dara Product: Processed data derived from Raw Data
                </div>
              </template>
              <Icon icon="mdi:information" class="text-xl text-gray-500" />
            </va-popover>
          </div>
        </div>

        <div class="flex w-full pb-6">
          <div class="w-60 flex flex-shrink-0 mr-4">
            <div class="flex items-center">
              <va-checkbox
                v-model="isAssignedSourceRawData"
                :disabled="willUploadRawData"
                @update:modelValue="resetRawDataSearch"
                color="primary"
                label="Assign source Raw Data"
                class="flex-grow"
              />
            </div>
          </div>

          <div class="flex-grow flex items-center">
            <DatasetSelectAutoComplete
              :disabled="submitAttempted || !isAssignedSourceRawData"
              v-model:selected="selectedRawData"
              v-model:search-term="datasetSearchText"
              :dataset-type="config.dataset.types.RAW_DATA.key"
              placeholder="Search Raw Data"
              @clear="resetRawDataSearch"
              @open="onRawDataSearchOpen"
              @close="onRawDataSearchClose"
              class="flex-grow"
              :label="'Dataset'"
            >
            </DatasetSelectAutoComplete>
            <va-popover>
              <template #body>
                <div class="w-96">
                  Associating a Data Product with a source Raw Data establishes
                  a clear lineage between the original data and its processed
                  form. This linkage helps to trace the origins of processed
                  data
                </div>
              </template>
              <Icon icon="mdi:information" class="ml-2 text-xl text-gray-500" />
            </va-popover>
          </div>
        </div>

        <div class="flex w-full pb-6">
          <div class="w-60 flex flex-shrink-0 mr-4">
            <div class="flex items-center">
              <va-checkbox
                v-model="isAssignedProject"
                @update:modelValue="
                  (val) => {
                    if (!val) {
                      projectSelected = null;
                    }
                  }
                "
                color="primary"
                label="Assign Project"
                class="flex-grow"
              />
            </div>
          </div>

          <div class="flex-grow flex items-center">
            <ProjectAsyncAutoComplete
              :disabled="submitAttempted || !isAssignedProject"
              v-model:selected="projectSelected"
              v-model:search-term="projectSearchText"
              placeholder="Search Projects"
              @clear="resetProjectSearch"
              @open="onProjectSearchOpen"
              @close="onProjectSearchClose"
              class="flex-grow"
              :label="'Project'"
            >
            </ProjectAsyncAutoComplete>

            <!--            <va-form-field v-model="projectSelected" v-slot="{ value: v }" class="flex-grow">-->
            <!--              <div class="flex flex-col w-full gap-y-5">-->
            <!--                <ProjectSelect-->
            <!--                  @select="setProject"-->
            <!--                  :disabled="!isAssignedProject"-->
            <!--                  :for-self="!auth.canOperate"-->
            <!--                  :label="'Project'"-->
            <!--                ></ProjectSelect>-->

            <!--                <ProjectList-->
            <!--                  v-if="Object.values(projectSelected).length > 0"-->
            <!--                  :projects="[Object.values(projectSelected)[0]]"-->
            <!--                  show-remove-->
            <!--                  @remove="-->
            <!--                    (project) => {-->
            <!--                      resetSelectedProject()-->
            <!--                    }-->
            <!--                  "-->
            <!--                >-->
            <!--                </ProjectList>-->
            <!--              </div>-->
            <!--            </va-form-field>-->
            <va-popover>
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
              <Icon icon="mdi:information" class="ml-2 text-xl text-gray-500" />
            </va-popover>
          </div>
        </div>

        <div class="flex w-full pb-6">
          <div class="w-60 flex flex-shrink-0 mr-4">
            <div class="flex items-center">
              <va-checkbox
                v-model="isAssignedSourceInstrument"
                @update:modelValue="
                  (val) => {
                    if (!val) {
                      selectedSourceInstrument = null;
                    }
                  }
                "
                color="primary"
                label="Assign source Instrument"
                class="flex-grow"
              />
            </div>
          </div>

          <div class="flex-grow flex items-center">
            <va-select
              v-model="selectedSourceInstrument"
              :options="sourceInstrumentOptions"
              :disabled="!isAssignedSourceInstrument"
              label="Source Instrument"
              placeholder="Select Source Instrument"
              class="flex-grow"
              :text-by="'name'"
              :track-by="'id'"
            />
            <div class="flex items-center ml-2">
              <va-popover>
                <template #body>
                  <div class="w-72">
                    Source instrument where this data was collected from.
                  </div>
                </template>
                <Icon icon="mdi:information" class="text-xl text-gray-500" />
              </va-popover>
            </div>
          </div>
        </div>
      </template>

      <template #step-content-2>
        <div class="flex flex-row" v-if="selectingFiles || selectingDirectory">
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
                    !!formErrors[STEP_KEYS.INFO] && !stepIsPristine
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

          <div class="flex-1">
            <DatasetFileUploadTable :files="displayedFilesToUpload" />
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
import { VaDivider, VaPopover } from "vuestic-ui";
import DatasetSelectAutoComplete from "@/components/dataset/DatasetSelectAutoComplete.vue";
import { Icon } from "@iconify/vue";
import instrumentService from "@/services/instrument";

const auth = useAuthStore();
const uploadToken = ref(useLocalStorage("uploadToken", ""));
// const token = ref(useLocalStorage("token", ""));

const STEP_KEYS = {
  GENERAL_INFO: "generalInfo",
  // PROJECT: 'project',
  // RAW_DATA: 'rawData',
  UPLOAD: "upload",
  INFO: "info",
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
  {
    key: STEP_KEYS.GENERAL_INFO,
    label: "General Info",
    icon: "material-symbols:info",
  },
  {
    key: STEP_KEYS.INFO,
    label: "Upload",
    icon: "material-symbols:play-circle",
  },

  // { key: STEP_KEYS.RAW_DATA, label: 'Source Raw Data', icon: 'mdi:dna' },
  // { key: STEP_KEYS.PROJECT, label: 'Project', icon: 'mdi:flask' },
];

const UPLOAD_FILE_REQUIRED_ERROR = "A file must be selected for upload.";
const DATASET_NAME_MAX_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";
const MISSING_METADATA_ERROR = "One or more fields have error";

const formErrors = ref({
  [STEP_KEYS.GENERAL_INFO]: null,
  [STEP_KEYS.UPLOAD]: null,
  [STEP_KEYS.INFO]: null,
});

const stepHasErrors = computed(() => {
  if (step.value === 0) {
    return !!formErrors.value[STEP_KEYS.UPLOAD];
  } else if (step.value === 1) {
    return !!formErrors.value[STEP_KEYS.GENERAL_INFO];
  } else if (step.value === 2) {
    return !!formErrors.value[STEP_KEYS.INFO];
  }
});

const isAssignedSourceInstrument = ref(true);
const isAssignedSourceRawData = ref(true);
const selectedRawData = ref(null);
const datasetSearchText = ref("");
const projectSearchText = ref("");
const isAssignedProject = ref(true);
const submissionSuccess = ref(false);

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

const datasetTypeOptions = ref(datasetTypes);

// const uploadingDatasetType = ref(config.dataset.types.DATA_PRODUCT.key)
const selectedDatasetType = ref(
  datasetTypes.find((e) => e.value === config.dataset.types.DATA_PRODUCT.key),
);

const willUploadRawData = ref(false);

const resetProjectSearch = (val) => {
  projectSelected.value = null;
  projectSearchText.value = "";
};

const resetRawDataSearch = (val) => {
  selectedRawData.value = null;
  datasetSearchText.value = "";
  console.log("isAssignedSourceRawData changed ", val);
  if (!val) {
    datasetTypeOptions.value = datasetTypes;
    console.log("Clearing raw data selection");
    // rawDataSelected = []
  } else {
    console.log("else");
    datasetTypeOptions.value = datasetTypes.filter(
      (e) => e.value === config.dataset.types.DATA_PRODUCT.key,
    );
    selectedDatasetType.value = datasetTypeOptions.value.find(
      (e) => e.value === config.dataset.types.DATA_PRODUCT.key,
    );
    willUploadRawData.value = false;
  }
  // todo - reset form errors
  // formErrors.value[STEP_KEYS.GENERAL_INFO] = null
};

const onRawDataSearchOpen = () => {
  selectedRawData.value = null;
};

const onRawDataSearchClose = () => {
  if (!selectedRawData.value) {
    datasetSearchText.value = "";
  }
};

const onProjectSearchOpen = () => {
  projectSelected.value = null;
};

const onProjectSearchClose = () => {
  if (!projectSelected.value) {
    projectSearchText.value = "";
  }
};

watch(selectedDatasetType, (newVal) => {
  if (newVal["value"] === config.dataset.types.RAW_DATA.key) {
    isAssignedSourceRawData.value = false;
    // rawDataSelected.value = []
    selectedRawData.value = null;
    willUploadRawData.value = true;
  } else {
    willUploadRawData.value = false;
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

// const isNextButtonDisabled = ref(false)
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
const stepPristineStates = ref([
  { [STEP_KEYS.GENERAL_INFO]: true },
  { [STEP_KEYS.UPLOAD]: true },
  { [STEP_KEYS.INFO]: true },
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
          console.log("res", res);
          console.log("Dataset exists?", res.data.exists);
          resolve(res.data.exists);
        })
        .catch((e) => {
          console.error("Error checking dataset existence");
          console.error(e);
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
  validateIfExists,
];

// const setProject = (project) => {
//   // console.log('set project', project)
//   // console.log('projectSelected', projectSelected.value)
//   // console.log('projectId', project.id)
//   // resetSelectedProject(project)
//   projectSelected.value = { [project.id]: project }
//
//   // console.log('projectSelected after remove', projectSelected.value)
//   // projectSelected.value[project.id] = project
//   // console.log('projectSelected after set', projectSelected.value)
// }

// const resetSelectedProject = (project) => {
//   // console.log('remove project', project)
//   // console.log('projectSelected before remove', projectSelected.value)
//   // console.log("typeof projectSelected.value", typeof projectSelected.value)
//   // console.log("project.id", project.id)
//   // console.log("projectSelected.value[project.id]", projectSelected.value[project.id])
//   projectSelected.value = {}
//   // console.log('projectSelected after remove', projectSelected.value)
// }

// const searchTerm = ref('')
const loading = ref(false);
const validatingForm = ref(false);
// const rawDataSelected = ref([])
const selectedSourceInstrument = ref(null);
const sourceInstrumentOptions = ref([]);
const projectSelected = ref(null);
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

const populatedDatasetName = ref("");

watch(selectingFiles, () => {
  if (selectingFiles.value) {
    populatedDatasetName.value = "";
  }
});

watch(selectingDirectory, () => {
  if (selectingDirectory.value) {
    populatedDatasetName.value = selectedDirectory.value.name;
  }
});

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
    ...(selectedRawData.value && {
      source_dataset_id: selectedRawData.value.id,
    }),
  };
});

const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.GENERAL_INFO]: null,
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
      console.log(`datasetNameValidationRules[3] then`);
      console.log("res", res);

      console.log("return val", {
        isNameValid: !res,
        error: res && DATASET_EXISTS_ERROR,
      });

      return {
        isNameValid: !res,
        error: res && DATASET_EXISTS_ERROR,
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
  console.log("setFormErrors called");
  resetFormErrors();
  // console.log("setFormErrors after resetFormErrors");

  console.log("step.value", step.value);
  console.log("isAssignedSourceRawData", isAssignedSourceRawData.value);
  console.log("selectedRawData", selectedRawData.value);
  console.log("isAssignedProject", isAssignedProject.value);
  // console.log('projectSelected', projectSelected.value)

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
    if (
      (isAssignedSourceRawData.value && !selectedRawData.value) ||
      (isAssignedProject.value && !projectSelected.value) ||
      (isAssignedSourceInstrument.value && !selectedSourceInstrument.value)
    ) {
      formErrors.value[STEP_KEYS.GENERAL_INFO] = MISSING_METADATA_ERROR;
      return;
    }
  }

  // if (step.value === 2) {
  //   if (!isAssignedProject.value) {
  //     formErrors.value[STEP_KEYS.PROJECT] = null
  //     return
  //   } else if (Object.values(projectSelected.value).length === 0) {
  //     formErrors.value[STEP_KEYS.PROJECT] = PROJECT_REQUIRED_ERROR
  //     return
  //   }
  // }

  if (step.value === 2) {
    const { isNameValid: datasetNameIsValid, error } =
      await validateDatasetName();
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

// const addDataset = (selectedDatasets) => {
//   rawDataSelected.value = selectedDatasets
//   selected
// }
//
// const removeDataset = () => {
//   rawDataSelected.value = []
// }

onMounted(() => {
  loading.value = true;

  instrumentService
    .getAll()
    .then((res) => {
      console.log("instruments:", res.data);
      sourceInstrumentOptions.value = res.data;
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
    chunkData.append("uploaded_entity_id", datasetUploadLog.value.dataset.id);
    chunkData.append("upload_path", datasetUploadLog.value.dataset.origin_path);
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
  // const uploaded = true; // Placeholder for actual upload logic
  if (!uploaded) {
    console.error(`Upload of file ${fileDetails.name} failed`);
  }

  const fileUploadLogId = datasetUploadLog.value.files.find(
    (e) => e.md5 === checksum,
  )?.id;
  fileDetails.uploadStatus = uploaded
    ? config.upload.status.UPLOADED
    : config.upload.status.UPLOAD_FAILED;

  let updated = false;
  if (uploaded) {
    try {
      await datasetUploadService.updateDatasetUploadLog(
        datasetUploadLog.value.audit_log.dataset_id,
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

        // const filesUploaded = await uploadFiles(filesNotUploaded.value)
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
      id: datasetUploadLog.value.files.find((f) => f.md5 === file.fileChecksum)
        .id,
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
        datasetUploadLog.value.audit_log.dataset.id,
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
        project_id: projectSelected.value ? projectSelected.value.id : null,
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
        datasetUploadLog.value?.audit_log?.dataset_id,
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

// const clearSelectedRawData = () => {
//   selectedRawData.value = null
//   datasetSearchText.value = ''
//   // searchTerm.value = ''
// }

onMounted(() => {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
  window.addEventListener("beforeunload", beforeUnload);
});

watch(
  [
    step,
    populatedDatasetName,
    projectSelected,
    isAssignedProject,
    selectedRawData,
    isAssignedSourceRawData,
    selectedSourceInstrument,
    isAssignedSourceInstrument,
    selectingFiles,
    selectingDirectory,
    isAssignedSourceRawData,
    filesToUpload,
  ],
  async (newVals, oldVals) => {
    // Mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    if (stepKey === STEP_KEYS.INFO) {
      // `1` corresponds to `populatedDatasetName`
      stepPristineStates.value[step.value][stepKey] = !oldVals[1] && newVals[1];
    } else {
      stepPristineStates.value[step.value][stepKey] = false;
    }

    await setFormErrors();
  },
);

// watch(selectedRawData, (newVal, oldVal) => {
//   console.log('Upload stepper')
//   console.log('selectedRawData changed', newVal, oldVal)
// })

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
      datasetUploadLog.value.audit_log.dataset_id,
    );
  }
});

watch((filesToUpload) => {
  // debugger
  console.log("filesToUpload", filesToUpload);
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
