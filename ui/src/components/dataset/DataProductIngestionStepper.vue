<template>
  <va-inner-loading :loading="loading">
    <va-form ref="dataProductIngestionForm" class="h-full">
      <va-stepper
        v-model="step"
        :steps="steps"
        controlsHidden
        class="h-full stepper"
      >
        <!-- Step icons and labels -->
        <template
          v-for="(step, i) in steps"
          :key="step.label"
          #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
        >
          <va-button
            class="step-button p-1 sm:p-3 cursor-pointer"
            :class="{
              'step-button--active': isActive,
              'step-button--completed': isCompleted,
            }"
            @click="setStep(i)"
            :disabled="submitAttempted || formHasErrors"
            preset="secondary"
          >
            <div class="flex flex-col items-center">
              <Icon :icon="step.icon" />
              <span class="hidden sm:block"> {{ step.label }} </span>
            </div>
          </va-button>
        </template>

        <template #step-content-0>
          <va-form-field
            v-model="datasetName"
            :rules="datasetNameValidationRules"
          >
            <template #default="{ value }">
              <va-input
                label="Dataset Name"
                :placeholder="'Dataset Name'"
                class="w-full"
                v-model="value.ref"
              />
              <!--              :error="!stepIsPristine"-->
            </template>
          </va-form-field>
        </template>

        <template #step-content-1>
          <va-form-field
            v-model="fileTypeSelected"
            v-slot="{ value: v }"
            :rules="[
              (v) => {
                return (
                  (typeof v?.name === 'string' &&
                    v?.name?.length > 0 &&
                    typeof v?.extension === 'string' &&
                    v?.extension?.length > 0) ||
                  'File Type is required'
                );
              },
            ]"
          >
            <FileTypeSelect
              v-model="v.ref"
              class="w-full"
              @file-type-created="
                (newFileType) => {
                  fileTypeList.push(newFileType);
                }
              "
              :allow-create-new="!submitAttempted"
              :file-type-list="fileTypeList"
            />
          </va-form-field>
        </template>

        <template #step-content-2>
          <va-form-field v-model="rawDataSelected" v-slot="{ value: v }">
            <DatasetSelect
              :selected-results="v.ref"
              @select="addDataset"
              @remove="removeDataset"
              select-mode="single"
              :dataset-type="config.dataset.types.RAW_DATA.key"
            ></DatasetSelect>
          </va-form-field>

          <div v-if="isDirty" class="mt-2">
            <p v-for="error in errorMessages" :key="error">
              {{ error }}
            </p>
          </div>
        </template>

        <template #step-content-3>
          <div class="flex">
            <va-select
              class="mr-2"
              v-model="searchSpace"
              @update:modelValue="resetSearch"
              :options="FILESYSTEM_SEARCH_SPACES"
              :text-by="'label'"
              label="Search space"
              :disabled="submitAttempted"
            />

            <div class="flex flex-col w-full">
              <FileListAutoComplete
                @files-retrieved="setRetrievedFiles"
                :disabled="submitAttempted"
                :base-path="searchSpaceBasePath"
                @loading="loading = true"
                @loaded="loading = false"
                @clear="resetSearch"
                @open="
                  () => {
                    console.log('open emitted');
                    isFileSearchAutocompleteOpen = true;
                    selectedFile = null;
                    searchFiles();
                  }
                "
                @close="
                  () => {
                    if (!selectedFile) {
                      fileListSearchText = '';
                    }
                    isFileSearchAutocompleteOpen = false;
                  }
                "
                v-model:selected="selectedFile"
                @update:selected="
                  (file) => {
                    console.log('@update:selected, Selected file:', file);
                    // selectedFile = file;
                    console.log('Selected file:', selectedFile);
                  }
                "
                v-model:search-text="fileListSearchText"
                @update:search-text="searchFiles"
                :options="fileList"
              />

              <div class="text-xs va-text-danger">
                {{ formErrors[STEP_KEYS.DIRECTORY] }}
              </div>
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
              :disabled="step === 0 || formHasErrors || submitAttempted"
            >
              Previous
            </va-button>
            <va-button
              class="flex-none"
              @click="onNextClick(nextStep)"
              :color="isLastStep ? 'success' : 'primary'"
              :disabled="formHasErrors || submissionSuccess"
            >
              {{ isLastStep ? (submitAttempted ? "Retry" : "Ingest") : "Next" }}
            </va-button>
          </div>
        </template>
      </va-stepper>
    </va-form>
  </va-inner-loading>
</template>

<script setup>
import config from "@/config";
import datasetService from "@/services/dataset";
import fileSystemService from "@/services/fs";
import toast from "@/services/toast";
import { useForm } from "vuestic-ui";

const { errorMessages, isDirty } = useForm("dataProductIngestionForm");

// error shown - step has errors, and is not pristine
//  - onMounted - setFormErrors()
//      - all fields pristine
//  - no need = step changes - current step is pristine
//  - next and previous disabled when step has errors

const STEP_KEYS = {
  NAME: "name",
  FILE_TYPE: "fileType",
  RAW_DATA: "rawData",
  DIRECTORY: "directory",
};
const DATASET_EXISTS_ERROR = "Dataset with the same name already exists";
const DATASET_NAME_REQUIRED_ERROR = "Dataset name cannot be empty";
const DATASET_NAME_MAX_LENGTH_ERROR = "Min length is 3 characters";
const HAS_SPACES_ERROR = "cannot contain spaces";
const INGESTION_FILE_REQUIRED_ERROR = "A file must be selected for ingestion.";
const FILE_TYPE_REQUIRED_ERROR = "A file type must be selected";
const RAW_DATA_REQUIRED_ERROR = "Source Raw Data must be selected";
const INGESTION_NOT_ALLOWED_ERROR =
  "Selected file cannot be ingested as a dataset";

const FILESYSTEM_SEARCH_SPACES = (config.filesystem_search_spaces || []).map(
  (space) => space[Object.keys(space)[0]],
);

const hasSpacesError = (prefix) => `${prefix} ${HAS_SPACES_ERROR}`;

const steps = [
  {
    key: STEP_KEYS.NAME,
    label: "Name",
    icon: "material-symbols:description-outline",
  },
  {
    key: STEP_KEYS.FILE_TYPE,
    label: "File Type",
    icon: "material-symbols:category",
  },
  { key: STEP_KEYS.RAW_DATA, label: "Source Raw Data", icon: "mdi:dna" },
  {
    key: STEP_KEYS.DIRECTORY,
    label: "Select Directory",
    icon: "material-symbols:folder",
  },
];

// Tracks if a step's form fields are pristine (i.e. not touched by user) or
// not. Errors are only shown when a step's form fields are not pristine.
// For steps 0 to 2, <va-form-field> components track the pristine state of
// their respective input fields. For step 3, pristine state is maintained by
// this component.
const stepPristineStates = ref([
  {
    [STEP_KEYS.NAME]: true,
  },
  { [STEP_KEYS.FILE_TYPE]: true },
  { [STEP_KEYS.RAW_DATA]: true },
  { [STEP_KEYS.DIRECTORY]: true },
]);

const stepIsPristine = computed(() => {
  return !!Object.values(stepPristineStates.value[step.value])[0];
});

const formErrors = ref({
  [STEP_KEYS.NAME]: null,
  [STEP_KEYS.FILE_TYPE]: null,
  [STEP_KEYS.RAW_DATA]: null,
  [STEP_KEYS.DIRECTORY]: null,
});
const formHasErrors = computed(() => {
  console.log("formErrors:", formErrors.value);
  const errors = Object.values(formErrors.value);
  console.log("Object.values(formErrors.value):", errors);
  return errors.some((error) => {
    console.log("error:", error);
    return error !== null;
  });
});

const isFileSearchAutocompleteOpen = ref(false);

const selectedFile = ref(null);

const resetFormErrors = () => {
  formErrors.value = {
    [STEP_KEYS.NAME]: null,
    [STEP_KEYS.FILE_TYPE]: null,
    [STEP_KEYS.RAW_DATA]: null,
    [STEP_KEYS.DIRECTORY]: null,
  };
};

const setFormErrors = async () => {
  resetFormErrors();
  const { isNameValid: datasetNameIsValid, error } =
    await validateDatasetName();

  if (step.value === 0) {
    if (!datasetNameIsValid) {
      formErrors.value[STEP_KEYS.NAME] = error;
    }
    return;
  } else if (step.value === 1) {
    if (!fileTypeSelected.value) {
      formErrors.value[STEP_KEYS.FILE_TYPE] = FILE_TYPE_REQUIRED_ERROR;
    }
    return;
  } else if (step.value === 2) {
    if (!rawDataSelected.value[0]) {
      formErrors.value[STEP_KEYS.RAW_DATA] = RAW_DATA_REQUIRED_ERROR;
      return;
    }
  } else {
    if (stepIsPristine.value) {
      return;
    }
    if (!selectedFile.value) {
      formErrors.value[STEP_KEYS.DIRECTORY] = INGESTION_FILE_REQUIRED_ERROR;
      return;
    } else {
      const restricted_dataset_paths = Object.values(
        config.restricted_ingestion_dirs,
      )
        .map((paths) => paths.split(","))
        .flat();
      const origin_path_is_restricted = restricted_dataset_paths.some(
        (path) => {
          console.log("regex path:", path);
          // TODO - enable wildcard match
          // const regex = new RegExp(path);
          return selectedFile.value.path === path;
          // ? true
          // : regex.test(selectedFile.value.path);
        },
      );

      if (origin_path_is_restricted) {
        formErrors.value[STEP_KEYS.DIRECTORY] = INGESTION_NOT_ALLOWED_ERROR;
      } else {
        formErrors.value[STEP_KEYS.DIRECTORY] = null;
      }
    }
  }
};

const searchSpace = ref(
  FILESYSTEM_SEARCH_SPACES instanceof Array &&
    FILESYSTEM_SEARCH_SPACES.length > 0
    ? FILESYSTEM_SEARCH_SPACES[0]
    : "",
);

const searchSpaceBasePath = computed({
  get: () => searchSpace.value.base_path,
  set: (value) => {
    searchSpace.value = value;
    resetSearch();
  },
});

const resetSearch = () => {
  selectedFile.value = null;
  fileListSearchText.value = "";
  setRetrievedFiles([]);
  formErrors.value[STEP_KEYS.DIRECTORY] = null;
};

const submissionSuccess = ref(false);
const fileTypeSelected = ref();
const fileTypeList = ref([]);
const rawDataSelected = ref([]);
const fileList = ref([]);
const datasetId = ref();
const datasetName = ref("");
const loading = ref(false);
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const rawDataList = ref([]);
const step = ref(0);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

const fileListSearchText = ref("");

const searchFiles = async () => {
  const _searchText =
    (searchSpace.value.base_path.endsWith("/")
      ? searchSpace.value.base_path
      : searchSpace.value.base_path + "/") + fileListSearchText.value;

  loading.value = true;
  fileSystemService
    .getPathFiles({
      path: _searchText,
      dirs_only: true,
    })
    .then((response) => {
      setRetrievedFiles(response.data);
    })
    .catch((err) => {
      console.log(err.response.status);
      console.error(err);
      if (err.response.status === 403) {
        setRetrievedFiles([]);
      } else {
        toast.error("Error fetching files");
      }
    })
    .finally(() => {
      loading.value = false;
    });
};

const setRetrievedFiles = (files) => {
  fileList.value = files;
};

const addDataset = (selectedDatasets) => {
  rawDataSelected.value = selectedDatasets;
};

const removeDataset = () => {
  rawDataSelected.value = [];
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
      // loading.value = true;
      datasetService
        .getAll({ type: "DATA_PRODUCT", name: value, match_name_exact: true })
        .then((res) => {
          // Vuestic expects this Promise to resolve with an error message, for
          // it to show the error message.
          resolve(res.data.datasets.length !== 0 ? DATASET_EXISTS_ERROR : true);
        })
        .catch((err) => {
          console.error(err);
        });
    }
  });
};

const preIngestion = () => {
  submitAttempted.value = true;
  return datasetService.create_dataset({
    name: datasetName.value,
    type: config.dataset.types.DATA_PRODUCT.key,
    file_type: fileTypeSelected.value,
    origin_path: selectedFile.value.path,
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

const onNextClick = (nextStep) => {
  if (isLastStep.value) {
    onSubmit();
  } else {
    nextStep();
  }
};

const datasetNameHasMinimumChars = (name) => {
  return name?.length >= 3;
};

const datasetNameIsNull = (name) => {
  return !name;
};

const stringHasSpaces = (name) => {
  return name?.indexOf(" ") > -1;
};

const datasetNameValidationRules = [
  (v) => {
    return datasetNameIsNull(v) ? DATASET_NAME_REQUIRED_ERROR : true;
  },
  (v) => {
    return datasetNameHasMinimumChars(v) ? true : DATASET_NAME_MAX_LENGTH_ERROR;
  },
  (v) => {
    return stringHasSpaces(v) ? hasSpacesError("Dataset name") : true;
  },
  validateNotExists,
];

const validateDatasetName = async () => {
  if (datasetNameIsNull(datasetName.value)) {
    return { isNameValid: false, error: DATASET_NAME_REQUIRED_ERROR };
  } else if (!datasetNameHasMinimumChars(datasetName.value)) {
    return { isNameValid: false, error: DATASET_NAME_MAX_LENGTH_ERROR };
  } else if (stringHasSpaces(datasetName.value)) {
    return { isNameValid: false, error: hasSpacesError("Dataset name") };
  }

  return datasetNameValidationRules[3](datasetName.value).then((res) => {
    return {
      isNameValid: res !== DATASET_EXISTS_ERROR,
      error: DATASET_EXISTS_ERROR,
    };
  });
};

watch(
  [
    datasetName,
    fileTypeSelected,
    rawDataSelected,
    selectedFile,
    fileListSearchText,
    isFileSearchAutocompleteOpen,
  ],
  async () => {
    // mark step's form fields as not pristine, for fields' errors to be shown
    const stepKey = Object.keys(stepPristineStates.value[step.value])[0];
    stepPristineStates.value[step.value][stepKey] = false;
    await setFormErrors();
  },
);

// Form errors are set when this component mounts, but not shown if a step's
// form fields are pristine.
watch(step, () => {
  setFormErrors();
});

onMounted(() => {
  loading.value = true;
  Promise.all([
    datasetService.get_file_types(),
    datasetService.getAll({ type: "RAW_DATA" }),
  ])
    .then(([res1, res2]) => {
      fileTypeList.value = res1.data;
      rawDataList.value = res2.data.datasets;
    })
    .catch((err) => {
      toast.error("Failed to load resources");
      console.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
});

onMounted(() => {
  setFormErrors();
});
</script>

<style lang="scss" scoped>
.stepper {
  .stepbutton {
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
