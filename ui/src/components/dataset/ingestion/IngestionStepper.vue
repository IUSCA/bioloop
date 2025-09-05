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
      <div class="flex">
        <va-select
          class="mr-2"
          v-model="searchSpace"
          @update:modelValue="resetSearch"
          :options="FILESYSTEM_SEARCH_SPACES"
          :text-by="'label'"
          :track-by="'key'"
          label="Search space"
          :disabled="submitAttempted || searchingFiles || validatingForm"
        />

        <div class="flex flex-col w-full">
          <FileListAutoComplete
            v-model:search-text="fileListSearchText"
            v-model:selected="selectedFile"
            @update:selected="fileList = []"
            :disabled="submitAttempted"
            :base-path="searchSpaceBasePath"
            :loading="searchingFiles"
            :validating="validatingForm"
            @clear="resetSearch"
            @open="onFileSearchAutocompleteOpen"
            @close="onFileSearchAutocompleteClose"
            :options="fileList"
          />

          <div class="text-xs va-text-danger" v-if="!stepIsPristine">
            {{ formErrors[STEP_KEYS.SELECT_DIRECTORY] }}
          </div>
        </div>
      </div>
    </template>

    <template #step-content-1>
      <div class="flex w-full pb-6 items-center">
        <va-select
          v-model="selectedDatasetType"
          :text-by="'label'"
          :track-by="'value'"
          :options="datasetTypeOptions"
          :disabled="submitAttempted"
          label="Dataset Type"
          placeholder="Select dataset type"
          class="flex-grow"
        />
        <div class="flex items-center ml-2">
          <va-popover>
            <template #body>
              <div class="w-96">
                - Raw Data: Original, unprocessed data collected from
                instruments.
                <br />
                - Data Product: Processed data derived from Raw Data
              </div>
            </template>
            <Icon icon="mdi:help-circle" class="text-xl text-gray-500" />
          </va-popover>
        </div>
      </div>

      <div class="flex w-full pb-6">
        <div class="w-60 flex flex-shrink-0 mr-4">
          <div class="flex items-center">
            <va-checkbox
              v-model="willAssignSourceRawData"
              @update:modelValue="resetRawDataSearch"
              :disabled="submitAttempted || isRawDataCheckboxDisabled"
              color="primary"
              label="Assign source Raw Data"
              class="flex-grow"
            />
          </div>
        </div>

        <div class="flex-grow flex items-center">
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
          >
          </DatasetSelectAutoComplete>
          <va-popover>
            <template #body>
              <div class="w-96">
                Associating a Data Product with a source Raw Data establishes a
                clear lineage between the original data and its processed form.
                This linkage helps to trace the origins of processed data
              </div>
            </template>
            <Icon icon="mdi:help-circle" class="ml-2 text-xl text-gray-500" />
          </va-popover>
        </div>
      </div>

      <div class="flex w-full pb-6">
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
          >
          </ProjectAsyncAutoComplete>
          <va-popover>
            <template #body>
              <div class="w-96">
                Assigning a dataset to a project establishes a connection
                between your data and a specific research initiatives. This
                association helps organize and categorize datasets within the
                context of your research projects, facilitating easier data
                management, access control, and collaboration among team members
                working on the same project.
              </div>
            </template>
            <Icon icon="mdi:help-circle" class="ml-2 text-xl text-gray-500" />
          </va-popover>
        </div>
      </div>

      <div class="flex w-full pb-6">
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
          />
          <div class="flex items-center ml-2">
            <va-popover>
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
      <IngestionInfo
        v-model:populated-dataset-name="ingestedDatasetName"
        :dataset="createdDataset"
        :ingestion-dir="selectedFile"
        :dataset-type="selectedDatasetType?.value"
        :project="projectSelected || projectCreated"
        :creating-new-project="willCreateNewProject"
        :source-raw-data="selectedRawData"
        :source-instrument="selectedSourceInstrument"
        :ingestion-space="searchSpace.label"
        :dataset-name-error="!stepIsPristine && formErrors[STEP_KEYS.INGEST]"
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
          {{ isLastStep ? submissionButtonText : "Next" }}
        </va-button>
      </div>
    </template>
  </va-stepper>
  <!--  </va-inner-loading>-->
</template>

<script setup>
import config from "@/config";
import instrumentService from "@/services/instrument";
import datasetService from "@/services/dataset";
import fileSystemService from "@/services/fs";
import toast from "@/services/toast";
import { watchDebounced } from "@vueuse/core";
import pm from "picomatch";
import DatasetSelectAutoComplete from "@/components/dataset/DatasetSelectAutoComplete.vue";
import { VaPopover } from "vuestic-ui";
import { Icon } from "@iconify/vue";
import Constants from "@/constants";
import { useAuthStore } from "@/stores/auth";
import projectService from "@/services/projects";

const auth = useAuthStore();

const STEP_KEYS = {
  SELECT_DIRECTORY: "selectDirectory",
  GENERAL_INFO: "generalInfo",
  INGEST: "info",
};

// Various errors that may be shown to the user during the process of ingesting a dataset.
const UNKNOWN_VALIDATION_ERROR = "An unknown error occurred";
const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";
const DATASET_NAME_HAS_SPACES_ERROR = "Dataset name cannot contain spaces";
const DATASET_NAME_MIN_LENGTH_ERROR =
  "Dataset name must have 3 or more characters.";
const NO_FILE_SELECTED_ERROR = "A file must be selected for ingestion";
const INGESTION_NOT_ALLOWED_ERROR =
  "Selected file cannot be ingested as a dataset";

// The list of filesystem spaces that the user can select datasets to ingest from.
const FILESYSTEM_SEARCH_SPACES = (config.filesystem_search_spaces || []).map(
  (space) => space[Object.keys(space)[0]],
);

// The various steps that the user will taken through during the process of ingesting a dataset.
const steps = [
  {
    key: STEP_KEYS.SELECT_DIRECTORY,
    label: "Select Directory",
    icon: "material-symbols:folder",
  },
  {
    key: STEP_KEYS.GENERAL_INFO,
    label: "General Info",
    icon: "material-symbols:info",
  },
  {
    key: STEP_KEYS.INGEST,
    label: "Ingest",
    icon: "material-symbols:play-circle",
  },
];

// Types of Datasets available to ingest
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

// Various values that the Submission button can display, based on the current state of the form submission.
const SUBMIT_BUTTON = {
  INGEST: "Ingest",
  PROCESSING: "Processing",
  RETRY: "Retry",
};

// An object containing the form validation errors for each step.
const formErrors = ref({
  [STEP_KEYS.SELECT_DIRECTORY]: null,
  [STEP_KEYS.GENERAL_INFO]: null,
  [STEP_KEYS.INGEST]: null,
});

// Search-text for Dataset Search
const datasetSearchText = ref("");
// Search-text for Project search
const projectSearchText = ref("");

// Options available to choose from in the `Dataset Type` dropdown.
const datasetTypeOptions = ref(datasetTypes);

// The type of Dataset that the user has selected to ingest.
const selectedDatasetType = ref(
  // By default, it is assumed that user will ingest a Data Product.
  datasetTypes.find((e) => e.value === config.dataset.types.DATA_PRODUCT.key),
);

/**
 * `stepPristineStates` tracks if a step's form fields are pristine (i.e. not touched by user) or not.
 * Errors are only shown when a step's form fields are not pristine.
 */
const stepPristineStates = ref([
  { [STEP_KEYS.SELECT_DIRECTORY]: true },
  { [STEP_KEYS.GENERAL_INFO]: true },
  { [STEP_KEYS.INGEST]: true },
]);
// `stepIsPristine` determines whether any of the fields in the current step have been interacted with by the user.
const stepIsPristine = computed(() => {
  return !!Object.values(stepPristineStates.value[step.value])[0];
});

const loadingResources = ref(false); // determines if the initial resources needed for the stepper are being fetched
const searchingFiles = ref(false);
const validatingForm = ref(false);
const loading = computed(() => {
  return loadingResources.value || searchingFiles.value || validatingForm.value;
});

// Various values related to the submission process.
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const submissionButtonText = ref(SUBMIT_BUTTON.INGEST);
const submissionSuccess = ref(false);

/**
 * Name of the Dataset that the user will ingest. This is set by the user before initiating the ingestion.
 */
const ingestedDatasetName = ref("");

// Current step index
const step = ref(0);

const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

// The file selected by the user for ingestion.
const selectedFile = ref(null);

// The list of available Instruments for assigning to the Dataset being ingested.
const sourceInstrumentOptions = ref([]);

// Stores information about the ingested Dataset.
const createdDataset = ref(null);
// The Raw Data that will be assigned to the Dataset being ingested.
const selectedRawData = ref(null);
// The (existing) Project that will be assigned to the Dataset being ingested.
const projectSelected = ref(null);
// The (new) Project that will be assigned to the Dataset being ingested.
const projectCreated = ref(null);
// The Instrument that will be assigned to the Dataset being ingested.
const selectedSourceInstrument = ref(null);

// determines whether there are any Raw Data options to choose from
const noRawDataToAssign = ref(false);
// determines whether there are any Project options to choose from
const noProjectsToAssign = ref(false);
// determines whether there are any Instrument options to choose from
const noInstrumentsToAssign = ref(false);

// Determines whether the Dataset being ingested is of type Raw Data or some other type.
const willIngestRawData = computed(() => {
  return (
    selectedDatasetType.value["value"] === config.dataset.types.RAW_DATA.key
  );
});

// Determines whether a new Project will be created and associated with the Dataset being ingested.
const willCreateNewProject = computed(() => {
  return (
    noProjectsToAssign.value &&
    auth.isFeatureEnabled("auto_create_project_on_dataset_creation")
  );
});

// Determines whether the current step has form-validation errors.
const stepHasErrors = computed(() => {
  if (step.value === 0) {
    return !!formErrors.value[STEP_KEYS.SELECT_DIRECTORY];
  } else if (step.value === 1) {
    return !!formErrors.value[STEP_KEYS.GENERAL_INFO];
  } else if (step.value === 2) {
    return !!formErrors.value[STEP_KEYS.INGEST];
  }
});

const isPreviousButtonDisabled = computed(() => {
  return step.value === 0 || submitAttempted.value || loading.value;
});

const isNextButtonDisabled = computed(() => {
  return stepHasErrors.value || submissionSuccess.value || loading.value;
});

/**
 * Request payload for associating the Dataset being ingested to a new or existing Project.
 * Sent along with the network request used to create an entry for the Dataset being ingested in the database.
 *
 * - If user has no Projects to assign to the Dataset being ingested, a new Project will be auto-created for them,
 * if this feature is enabled.
 */
const getProjectCreationPayload = () => {
  let project_data;
  // If a new Project is to be created, the current user will be assigned to it.
  if (willCreateNewProject.value) {
    project_data = {
      browser_enabled: auth.isFeatureEnabled("genomeBrowser") || false,
      assignee_user_ids: [auth.user.id],
      name: `Project-${ingestedDatasetName.value}`,
    };
  } else {
    project_data = projectSelected.value && {
      id: projectSelected.value.id,
    };
  }
  return project_data;
};

/**
 * Payload sent along with the network request responsible for creating a database entry of the Dataset being ingested.
 */
const ingestionFormData = computed(() => {
  let project_data = getProjectCreationPayload();
  return {
    name: ingestedDatasetName.value,
    type: selectedDatasetType.value["value"],
    ...(selectedRawData.value && {
      src_dataset_id: selectedRawData.value.id,
    }),
    ...(project_data && { project_data }),
    ...(selectedSourceInstrument.value && {
      src_instrument_id: selectedSourceInstrument.value.id,
    }),
    origin_path: selectedFile.value.path,
    ingestion_space: searchSpace.value.key,
    create_method: Constants.DATASET_CREATE_METHODS.IMPORT,
  };
});

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

const onFileSearchAutocompleteOpen = () => {
  isFileSearchAutocompleteOpen.value = true;
  selectedFile.value = null;
};

const onFileSearchAutocompleteClose = () => {
  if (!selectedFile.value) {
    fileListSearchText.value = "";
  }
  fileList.value = [];
  isFileSearchAutocompleteOpen.value = false;
  if (validatingForm.value) {
    validatingForm.value = false;
  }
};

const resetSearch = () => {
  selectedFile.value = null;
  fileListSearchText.value = "";
  setRetrievedFiles([]);
  formErrors.value[STEP_KEYS.SELECT_DIRECTORY] = null;
  if (validatingForm.value) {
    validatingForm.value = false;
  }
};

const isStepperButtonDisabled = (stepIndex) => {
  return (
    submitAttempted.value ||
    submissionSuccess.value ||
    step.value < stepIndex ||
    loading.value
  );
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
          // console.error(e);
          reject();
        });
    }
  });
};

/**
 * Async function to check if a name selected for the Dataset being ingested is valid.
 *
 * Conditions to consider a name valid:
 * - Not empty
 * - Minimum length of 3 characters
 * - No spaces
 * - Does not already exist in the system
 */
const validateDatasetName = async () => {
  if (!ingestedDatasetName.value) {
    return { isNameValid: false, error: DATASET_NAME_REQUIRED_ERROR };
  } else if (ingestedDatasetName.value.length < 3) {
    return { isNameValid: false, error: DATASET_NAME_MIN_LENGTH_ERROR };
  } else if (ingestedDatasetName.value.indexOf(" ") > -1) {
    return { isNameValid: false, error: DATASET_NAME_HAS_SPACES_ERROR };
  }

  validatingForm.value = true;
  return validateIfExists(ingestedDatasetName.value)
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

// Reset form errors across all steps.
const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.SELECT_DIRECTORY]: null,
    [STEP_KEYS.GENERAL_INFO]: null,
    [STEP_KEYS.INGEST]: null,
  };
};

// Set form-validation errors for the current step's fields.
const setFormErrors = async () => {
  resetFormErrors();

  if (step.value === 0) {
    if (!selectedFile.value) {
      formErrors.value[STEP_KEYS.SELECT_DIRECTORY] = NO_FILE_SELECTED_ERROR;
      return;
    }
    // check if the selected file is allowed to be ingested as a dataset
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
      formErrors.value[STEP_KEYS.SELECT_DIRECTORY] =
        INGESTION_NOT_ALLOWED_ERROR;
      return;
    } else {
      formErrors.value[STEP_KEYS.SELECT_DIRECTORY] = null;
    }
  }

  if (step.value === 1) {
    if (
      (willAssignSourceRawData.value && !selectedRawData.value) ||
      (willAssignProject.value && !projectSelected.value) ||
      (willAssignSourceInstrument.value && !selectedSourceInstrument.value)
    ) {
      formErrors.value[STEP_KEYS.GENERAL_INFO] = true;
    }
  }

  if (step.value === 2) {
    const { isNameValid: datasetNameIsValid, error } =
      await validateDatasetName();
    if (datasetNameIsValid) {
      formErrors.value[STEP_KEYS.INGEST] = null;
    } else {
      formErrors.value[STEP_KEYS.INGEST] = error;
    }
  }
};

const fileListSearchText = ref("");
const fileList = ref([]);

const searchSpace = ref(
  FILESYSTEM_SEARCH_SPACES instanceof Array &&
    FILESYSTEM_SEARCH_SPACES.length > 0
    ? FILESYSTEM_SEARCH_SPACES[0]
    : "",
);
const isFileSearchAutocompleteOpen = ref(false);

const searchSpaceBasePath = computed(() => searchSpace.value.base_path);

const _searchText = computed(() => {
  return (
    (searchSpace.value.base_path.endsWith("/")
      ? searchSpace.value.base_path
      : searchSpace.value.base_path + "/") + fileListSearchText.value
  );
});

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
      // console.error(err);
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

const setRetrievedFiles = (files) => {
  fileList.value = files;
};

const getRestrictedIngestionPaths = () => {
  return config.restricted_ingestion_dirs[searchSpace.value.key].paths.split(
    ",",
  );
};

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
 * ingested.
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
 * `willAssignProject` determines whether the user wants to assign a Project to the Dataset being ingested.
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
 * 1. When type of Dataset to be ingested changes:
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
 * - The Dataset being ingested is a Raw Data
 */
const isRawDataCheckboxDisabled = computed(() => {
  return noRawDataToAssign.value || willIngestRawData.value;
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
 * ingested.
 * - This is a writable Computed property that manages the checked/unchecked state of the 'Assign
 * Raw Data' checkbox.
 *
 * @property {Function} get - Getter function for the checkbox state.
 *   - Returns `false` if there are no Raw Data to choose from, or if the type of the Dataset being ingested is a Raw
 *   Data.
 *   - Otherwise, returns the internal checkbox state.
 *
 * @property {Function} set - Setter function for the checkbox state.
 *   - Updates the internal checkbox state only if there are some Raw Data options to choose from,
 *   and the type of the Dataset being ingested is not a Raw Data.
 *
 * @returns {boolean} The current checked/unchecked state of the 'Assign Raw Data' checkbox.
 */
const willAssignSourceRawData = computed({
  get: () => {
    if (noRawDataToAssign.value || willIngestRawData.value) {
      return false;
    }
    return rawDataCheckboxInternalState.value;
  },
  set: (newValue) => {
    if (!noRawDataToAssign.value && !willIngestRawData.value) {
      rawDataCheckboxInternalState.value = newValue;
    }
  },
});
/**
 * Handler for when the type of the Dataset to be ingested changes.
 * - Resets the search query for the Raw Data search field
 * - Updates the internal state of the `Assign Raw Data` checkbox to `true` (checked) if:
 *   - The Dataset to be ingested is not of type Raw Data, AND
 *   - There are Raw Data options to choose from for assignment to the ingested Dataset
 */
watch(selectedDatasetType, () => {
  resetRawDataSearch();
  if (!willIngestRawData.value && !noRawDataToAssign.value) {
    rawDataCheckboxInternalState.value = true;
  }
});

// Todo: send notification to operator/admin on wf initiation errors

const onSubmit = async () => {
  if (!selectedFile.value) {
    await setFormErrors();
    return Promise.reject();
  }

  submitAttempted.value = true;
  submissionButtonText.value = SUBMIT_BUTTON.PROCESSING;

  try {
    // create the Dataset in the database
    await createDataset();
    // If a Project is associated with the Dataset being ingested, its details will need to be fetched to show in the UI
    const shouldFetchAssociatedProject =
      projectSelected.value || willCreateNewProject.value;
    if (shouldFetchAssociatedProject) {
      await fetchAssociatedProject();
      await fetchAssociatedProjectDetails();
    }
    // Initiate the ingestion process
    await initiateIngestion();
    handleSuccessfulIngestion();
  } catch (error) {
    handleSubmissionError(error);
  }
};

// This method is expected to be idempotent, to ensure that it can be called upon form-submission retries.
const createDataset = async () => {
  if (createdDataset.value) {
    return;
  }
  try {
    const res = await datasetService.create_dataset(ingestionFormData.value);
    createdDataset.value = res.data;
    return res;
  } catch (error) {
    if (error.response && error.response.status === 409) {
      throw new Error(ERRORS.DATASET_EXISTS);
    } else {
      throw new Error(ERRORS.CREATE_DATASET);
    }
  }
};

// This method is expected to be idempotent, to ensure that it can be called upon form-submission retries.
const fetchAssociatedProject = async () => {
  // If associated Project has already been fetched, skip.
  if ((createdDataset.value.projects || []).length > 0) {
    return;
  }
  // Fetch associated Projects.
  try {
    const res = await datasetService.getById({
      id: createdDataset.value.id,
      include_projects: true,
    });
    createdDataset.value.projects = res.data.projects;
  } catch (error) {
    // console.error("Error fetching associated projects:", error);
    throw new Error(ERRORS.FETCH_ASSOCIATED_PROJECTS);
  }
};

// This method is expected to be idempotent, to ensure that it can be called upon form-submission retries.
const fetchAssociatedProjectDetails = async () => {
  // If associated Project's details has already been fetched, skip.
  if (projectCreated.value) {
    return;
  }
  // Fetch associated Project's details.
  try {
    const res = await projectService.getById({
      id: createdDataset.value.projects[0].project_id,
      forSelf: !(auth.canOperate || auth.canAdmin),
    });
    projectCreated.value = res.data;
  } catch (error) {
    // console.error("Error fetching associated project details:", error);
    throw new Error(ERRORS.GET_PROJECT_DETAILS);
  }
};

const initiateIngestion = async () => {
  try {
    await datasetService.initiate_workflow_on_dataset({
      dataset_id: createdDataset.value.id,
      workflow: "integrated",
    });
    toast.success("Initiated dataset ingestion");
  } catch (error) {
    // console.error("Error initiating ingestion:", error);
    throw new Error(ERRORS.INITIATE_INGESTION);
  }
};

const handleSuccessfulIngestion = () => {
  submissionButtonText.value = SUBMIT_BUTTON.INGEST;
  submissionSuccess.value = true;
};

const handleSubmissionError = (error) => {
  // console.error("Error during submission:", error);
  let errorMessage;

  switch (error.message) {
    case ERRORS.CREATE_DATASET:
    case ERRORS.FETCH_ASSOCIATED_PROJECTS:
    case ERRORS.GET_PROJECT_DETAILS:
    case ERRORS.INITIATE_INGESTION:
      errorMessage = "An error occurred. Please try again.";
      break;
    case ERRORS.DATASET_EXISTS:
      errorMessage = ERRORS.DATASET_EXISTS;
      break;
    default:
      errorMessage =
        error.message || "An unexpected error occurred. Please try again.";
  }

  toast.error(errorMessage);
  submissionButtonText.value = SUBMIT_BUTTON.RETRY;
};

const ERRORS = {
  CREATE_DATASET: "Failed to create Dataset",
  DATASET_EXISTS: "A Dataset with this name already exists",
  FETCH_ASSOCIATED_PROJECTS: "Failed to fetch associated Project",
  GET_PROJECT_DETAILS: "Failed to retrieve associated Project's details",
  INITIATE_INGESTION: "Failed to initiate Ingestion",
};

const onNextClick = (nextStep) => {
  if (isLastStep.value) {
    if (submitAttempted.value && !submissionSuccess.value) {
      if (submissionButtonText.value === SUBMIT_BUTTON.RETRY) {
        onSubmit();
      }
    } else {
      onSubmit();
    }
  } else {
    nextStep();
  }
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

// Form errors are set when this component mounts, or when a form field's value
// changes, or when the current step changes.
watch(
  [
    step,
    ingestedDatasetName,
    projectSelected,
    willAssignProject,
    selectedRawData,
    willAssignSourceRawData,
    selectedSourceInstrument,
    willAssignSourceInstrument,
    selectedFile,
    fileListSearchText,
    isFileSearchAutocompleteOpen,
    searchSpace,
  ],
  async (newVals, oldVals) => {
    // mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    if (stepKey === STEP_KEYS.INGEST) {
      // `1` corresponds to `ingestedDatasetName`
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
 *  - A list of Raw Data that may be assigned to the Dataset being ingested
 *  - A list of Projects that may be assigned to the Dataset being ingested
 *
 *  Only a subset of the entirety of the Raw Data and Projects available to the user for assignment are loaded at this
 *  point. If a user has access to more Raw Data and Projects to choose from, they will be lazily-loaded later.
 *  This initial load of a subset of options is done only to permanently disable the "Raw Data" and "Project"
 *  search fields if the user has zero options to choose from.
 */
onMounted(async () => {
  loadingResources.value = true;

  try {
    // Load Instruments that will be available for assignment to the Dataset being ingested.
    const onLoadInstrumentResponse = await instrumentService.getAll();
    sourceInstrumentOptions.value = onLoadInstrumentResponse.data;
    noInstrumentsToAssign.value = sourceInstrumentOptions.value.length === 0;

    // Do an initial load of Raw Data to verify whether the user has access to any Raw Data to choose from for
    // assignment to the Dataset being ingested. If not, the `Assign Raw Data` checkbox will always be disabled.
    const onLoadRawDataOptionsResponse = await datasetService.getAll({
      type: config.dataset.types.RAW_DATA.key,
    });
    noRawDataToAssign.value =
      onLoadRawDataOptionsResponse.data.datasets.length === 0;

    // Do an initial load of Projects to verify whether the user has access to any Projects to choose from for
    // assignment to the Dataset being ingested. If not, the `Assign Project` checkbox will always be disabled.
    const onLoadProjectOptionsResponse = await projectService.getAll({
      forSelf: !(auth.canOperate || auth.canAdmin),
    });
    noProjectsToAssign.value =
      onLoadProjectOptionsResponse.data.projects.length === 0;
  } catch (error) {
    // console.error("Error loading resources:", error);
    toast.error("An error occurred. Please refresh the page to try again.");
  }

  loadingResources.value = false;
});

/**
 * Evaluate form-validation errors when first mounted, to make sure any form-buttons are disabled until all
 * form-validations are passing.
 */
onMounted(async () => {
  await setFormErrors();
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
