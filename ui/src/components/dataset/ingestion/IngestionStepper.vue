<template>
  <!--  <va-inner-loading :loading="loading" class="h-full">-->
  <va-stepper
    v-model="step"
    :steps="steps"
    controlsHidden
    class="h-full ingestion-stepper"
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
          submitAttempted ||
          step < i ||
          searchingFiles ||
          loadingResources ||
          asyncValidatingDatasetName
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
      <div class="flex">
        <va-select
          class="mr-2"
          v-model="searchSpace"
          @update:modelValue="resetSearch"
          :options="FILESYSTEM_SEARCH_SPACES"
          :text-by="'label'"
          :track-by="'key'"
          label="Search space"
          :disabled="
            submitAttempted || searchingFiles || asyncValidatingDatasetName
          "
        />

        <div class="flex flex-col w-full">
          <FileListAutoComplete
            @files-retrieved="setRetrievedFiles"
            :disabled="submitAttempted"
            :base-path="searchSpaceBasePath"
            :loading="searchingFiles"
            :validating="asyncValidatingDatasetName"
            @clear="resetSearch"
            @open="
              () => {
                isFileSearchAutocompleteOpen = true;
                selectedFile = null;
              }
            "
            @close="
              () => {
                if (!selectedFile) {
                  fileListSearchText = '';
                }
                fileList = [];
                isFileSearchAutocompleteOpen = false;
                if (asyncValidatingDatasetName) {
                  asyncValidatingDatasetName = false;
                }
              }
            "
            v-model:selected="selectedFile"
            @update:selected="fileList = []"
            v-model:search-text="fileListSearchText"
            :options="fileList"
          />

          <div class="text-xs va-text-danger" v-if="!stepIsPristine">
            {{ formErrors[STEP_KEYS.DIRECTORY] }}
          </div>
        </div>
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

        <div class="text-xs va-text-danger" v-if="!stepIsPristine">
          {{ formErrors[STEP_KEYS.DIRECTORY] }}
        </div>
      </div>
    </template>

    <template #step-content-2>
      <IngestionInfo
        :ingestion-dir="selectedFile"
        :source-raw-data="rawDataSelected[0]"
        :ingestion-space="searchSpace.label"
        :dataset-id="datasetId"
      />
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
          {{ isLastStep ? (submitAttempted ? "Retry" : "Ingest") : "Next" }}
        </va-button>
      </div>
    </template>
  </va-stepper>
  <!--  </va-inner-loading>-->
</template>

<script setup>
import config from "@/config";
import datasetService from "@/services/dataset";
import fileSystemService from "@/services/fs";
import toast from "@/services/toast";
import pm from "picomatch";
import { watchDebounced } from "@vueuse/core";

const STEP_KEYS = {
  DIRECTORY: "directory",
  RAW_DATA: "rawData",
  INFO: "info",
};
const DATASET_NAME_MAX_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";
const DATASET_NAME_EXISTS_ERROR =
  "A Data Product with this name already exists.";
const INGESTION_FILE_REQUIRED_ERROR = "A file must be selected for ingestion.";
const INGESTION_NOT_ALLOWED_ERROR =
  "Selected file cannot be ingested as a dataset";
const SOURCE_RAW_DATA_REQUIRED_ERROR =
  "You have requested a source Raw Data to be assigned. Please select one.";

const FILESYSTEM_SEARCH_SPACES = (config.filesystem_search_spaces || []).map(
  (space) => space[Object.keys(space)[0]],
);

const steps = [
  {
    key: STEP_KEYS.DIRECTORY,
    label: "Select Directory",
    icon: "material-symbols:folder",
  },
  { key: STEP_KEYS.RAW_DATA, label: "Source Raw Data", icon: "mdi:dna" },
  {
    key: STEP_KEYS.INFO,
    label: "Ingestion Details",
    icon: "material-symbols:info-outline",
  },
];

const isAssignedSourceRawData = ref(true);
const submissionSuccess = ref(false);
const rawDataSelected = ref([]);
const fileListSearchText = ref("");
const fileList = ref([]);
const datasetId = ref();
const loadingResources = ref(false); // determines if the initial resources needed for the stepper are being fetched
const searchingFiles = ref(false);
const asyncValidatingDatasetName = ref(false);
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const rawDataList = ref([]);
const step = ref(0);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

const isNextButtonDisabled = computed(() => {
  return (
    stepHasErrors.value ||
    submissionSuccess.value ||
    loadingResources.value ||
    searchingFiles.value ||
    asyncValidatingDatasetName.value
  );
});
const isPreviousButtonDisabled = computed(() => {
  return (
    step.value === 0 ||
    submissionSuccess.value ||
    searchingFiles.value ||
    loadingResources.value ||
    asyncValidatingDatasetName.value
  );
});

// Tracks if a step's form fields are pristine (i.e. not touched by user) or
// not. Errors are only shown when a step's form fields are not pristine. At
// this time, errors are only shown on steps 0 (STEP_KEYS.DIRECTORY) and 1
// (STEP_KEYS.RAW_DATA)
const stepPristineStates = ref([
  { [STEP_KEYS.DIRECTORY]: true },
  { [STEP_KEYS.RAW_DATA]: true },
  { [STEP_KEYS.INFO]: true },
]);

const stepIsPristine = computed(() => {
  return !!Object.values(stepPristineStates.value[step.value])[0];
});

const formErrors = ref({
  [STEP_KEYS.DIRECTORY]: null,
  [STEP_KEYS.RAW_DATA]: null,
  [STEP_KEYS.INFO]: null,
});
const stepHasErrors = computed(() => {
  if (step.value === 0) {
    return !!formErrors.value[STEP_KEYS.DIRECTORY];
  } else if (step.value === 1) {
    return !!formErrors.value[STEP_KEYS.RAW_DATA];
  } else {
    return false;
  }
});

const isFileSearchAutocompleteOpen = ref(false);

const selectedFile = ref(null);

const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.DIRECTORY]: null,
    [STEP_KEYS.RAW_DATA]: null,
    [STEP_KEYS.INFO]: null,
  };
};

const setFormErrors = async () => {
  resetFormErrors();
  const { isNameValid: datasetNameIsValid, error } =
    await validateDatasetName();

  if (step.value === 0) {
    if (!datasetNameIsValid) {
      formErrors.value[STEP_KEYS.DIRECTORY] = error;
    } else {
      const restricted_dataset_paths = getRestrictedIngestionPaths();
      const origin_path_is_restricted = selectedFile.value
        ? restricted_dataset_paths.some((pattern) => {
            const _path = selectedFile.value.path;
            let isMatch = pm(pattern);
            const matches = isMatch(_path, pattern);
            return matches.isMatch;
          })
        : false;

      if (origin_path_is_restricted) {
        formErrors.value[STEP_KEYS.DIRECTORY] = INGESTION_NOT_ALLOWED_ERROR;
      } else {
        formErrors.value[STEP_KEYS.DIRECTORY] = null;
      }
    }
  } else if (step.value === 1) {
    if (!isAssignedSourceRawData.value) {
      formErrors.value[STEP_KEYS.RAW_DATA] = null;
      return;
    }
    if (rawDataSelected.value.length === 0) {
      formErrors.value[STEP_KEYS.RAW_DATA] = SOURCE_RAW_DATA_REQUIRED_ERROR;
    }
  }
};

// determines if the dataset (Data Product) named `value` already exists
const asyncValidateDatasetName = (value) => {
  return new Promise((resolve) => {
    // Vuestic claims that it should not run async validation if synchronous
    // validation fails, but it seems to be triggering async validation
    // nonetheless when `value` is ''. Hence the explicit check for whether
    // `value` is falsy.
    if (!value) {
      resolve(true);
    } else {
      asyncValidatingDatasetName.value = true;
      datasetService
        .getAll({ type: "DATA_PRODUCT", name: value })
        .then((res) => {
          // Vuestic expects this Promise to resolve with an error message, for
          // it to show the error message.
          resolve(
            res.data.datasets.length !== 0 ? DATASET_NAME_EXISTS_ERROR : true,
          );
        })
        .catch((err) => {
          console.error(err);
        })
        .finally(() => {
          asyncValidatingDatasetName.value = false;
        });
    }
  });
};

const validateDatasetName = async () => {
  const datasetName = selectedFile.value?.name;
  if (datasetNameIsNull(datasetName)) {
    return { isNameValid: false, error: INGESTION_FILE_REQUIRED_ERROR };
  } else if (!datasetNameHasMinimumChars(datasetName)) {
    return { isNameValid: false, error: DATASET_NAME_MAX_LENGTH_ERROR };
  }

  return asyncValidateDatasetName(datasetName).then((res) => {
    return {
      isNameValid: res !== DATASET_NAME_EXISTS_ERROR,
      error:
        res !== DATASET_NAME_EXISTS_ERROR ? null : DATASET_NAME_EXISTS_ERROR,
    };
  });
};

const datasetNameHasMinimumChars = (name) => {
  return name?.length >= 3;
};

const datasetNameIsNull = (name) => {
  return !name;
};

const searchSpace = ref(
  FILESYSTEM_SEARCH_SPACES instanceof Array &&
    FILESYSTEM_SEARCH_SPACES.length > 0
    ? FILESYSTEM_SEARCH_SPACES[0]
    : "",
);

const searchSpaceBasePath = computed(() => searchSpace.value.base_path);

const _searchText = computed(() => {
  return (
    (searchSpace.value.base_path.endsWith("/")
      ? searchSpace.value.base_path
      : searchSpace.value.base_path + "/") + fileListSearchText.value
  );
});

const resetSearch = () => {
  selectedFile.value = null;
  fileListSearchText.value = "";
  setRetrievedFiles([]);
  formErrors.value[STEP_KEYS.DIRECTORY] = null;
  if (asyncValidatingDatasetName.value) {
    asyncValidatingDatasetName.value = false;
  }
};

const searchFiles = async () => {
  fileSystemService
    .getPathFiles({
      path: _searchText.value,
      dirs_only: true,
      search_space: searchSpace.value.key,
    })
    .then((response) => {
      setRetrievedFiles(response.data);
    })
    .catch((err) => {
      console.error(err);
      if (err.response.status === 403 || err.response.status === 404) {
        setRetrievedFiles([]);
      } else {
        toast.error("Error fetching files");
      }
    })
    .finally(() => {
      searchingFiles.value = false;
    });
};

// Set loading to true when FileListAutoComplete is either opened or typed into.
// The actual search begins after a delay, but a loading indicator should be
// shown before the search begins.
watch([isFileSearchAutocompleteOpen, fileListSearchText], () => {
  if (isFileSearchAutocompleteOpen.value) {
    searchingFiles.value = true;
  }
});

// Begin search once FileListAutoComplete is opened, or typed into, but
// after a delay.
watchDebounced(
  [isFileSearchAutocompleteOpen, fileListSearchText],
  () => {
    if (isFileSearchAutocompleteOpen.value) {
      searchFiles();
    }
  },
  { debounce: 1000, maxWait: 3000 },
);

const setRetrievedFiles = (files) => {
  fileList.value = files;
};

const addDataset = (selectedDatasets) => {
  rawDataSelected.value = selectedDatasets;
};

const removeDataset = () => {
  rawDataSelected.value = [];
};

const preIngestion = () => {
  return datasetService.create_dataset({
    data: {
      name: selectedFile.value.name,
      type: config.dataset.types.DATA_PRODUCT.key,
      origin_path: selectedFile.value.path,
    },
    ingestion_space: searchSpace.value.key,
  });
};

const initiateIngestion = async () => {
  return datasetService
    .initiate_workflow_on_dataset({
      dataset_id: datasetId.value,
      workflow: "integrated",
    })
    .then(() => {
      toast.success("Initiated dataset ingestion");
      submissionSuccess.value = true;
    })
    .catch((err) => {
      toast.error("Failed to initiate ingestion");
      console.error(err);
      submissionSuccess.value = false;
    });
};

const onSubmit = async () => {
  if (!selectedFile.value) {
    await setFormErrors();
    return Promise.reject();
  }
  submitAttempted.value = true;

  return new Promise((resolve, reject) => {
    preIngestion()
      .then(async (res) => {
        datasetId.value = res.data.id;
        return datasetId.value;
      })
      .then(() => {
        return initiateIngestion();
      })
      .catch((err) => {
        toast.error("Failed to initiate ingestion");
        console.error(err);
        reject(err);
      });
  });
};

const getRestrictedIngestionPaths = () => {
  return config.restricted_ingestion_dirs[searchSpace.value.key].paths.split(
    ",",
  );
};

const onNextClick = (nextStep) => {
  if (isLastStep.value) {
    onSubmit();
  } else {
    nextStep();
  }
};

// Form errors are set when this component mounts, or when a form field's value
// changes, or when the current step changes.
watch(
  [
    rawDataSelected,
    selectedFile,
    fileListSearchText,
    isFileSearchAutocompleteOpen,
    searchSpace,
    isAssignedSourceRawData,
  ],
  async (newVals, oldVals) => {
    // mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    if (stepKey === STEP_KEYS.RAW_DATA) {
      stepPristineStates.value[step.value][stepKey] = !oldVals[5] && newVals[5];
    } else {
      stepPristineStates.value[step.value][stepKey] = false;
    }

    await setFormErrors();
  },
);

// separate watcher for when step changes, since we don't want to mark the form
// fields as not pristine upon step changes
watch(step, async () => {
  if (step.value !== 2) {
    await setFormErrors();
  }
});

onMounted(async () => {
  await setFormErrors();
});

onMounted(() => {
  loadingResources.value = true;
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
      loadingResources.value = false;
    });
});
</script>

<style lang="scss">
.ingestion-stepper {
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
}
</style>
