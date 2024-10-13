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
            :disabled="submitAttempted"
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
            :rules="[
              (v) => v.length >= 3 || 'Min length is 3 characters',
              (v) => v?.indexOf(' ') === -1 || 'Name cannot contain spaces',
              validateNotExists,
            ]"
          >
            <template #default="{ value }">
              <va-input
                label="Dataset Name"
                :placeholder="'Dataset Name'"
                class="w-full"
                v-model="value.ref"
              />
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
            <!--            :rules="[-->
            <!--              (v) => {-->
            <!--                return typeof v.length > 0 || 'Source dataset is required';-->
            <!--              },-->
            <!--            ]"-->
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
          <!--          <va-input class="w-full" v-model="filePath" />-->

          <va-inner-loading :loading="loading">
            <!--              @update:selected-file="(file) => setSelectedFile(file)"-->
            <!--              v-model:selected-file="selectedFile"-->
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

              <!--                <va-form-field-->
              <!--                  v-model="selectedFile"-->
              <!--                  v-slot="{ value: v }"-->
              <!--                  :rules="[-->
              <!--                    (v) => {-->
              <!--                      console.log('File validation:', v);-->
              <!--                      // console.log('v.ref:', v.ref);-->
              <!--                      console.log('typeof v:', typeof v);-->
              <!--                      // console.log('File path:', v.path);-->
              <!--                      console.dir(v, { depth: null });-->
              <!--                      return (-->
              <!--                        typeof v !== 'object' ||-->
              <!--                        'Selected file cannot be ingested as a dataset'-->
              <!--                      );-->
              <!--                    },-->
              <!--                  ]"-->
              <!--                >-->
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
                <!--                :error="!formErrors[STEP_KEYS.DIRECTORY]"-->
                <!--                </va-form-field>-->

                <div class="text-xs va-text-danger">
                  {{ formErrors[STEP_KEYS.DIRECTORY] }}
                </div>
              </div>
            </div>

            <!--            <FileList :selected-files="fileList" />-->
            <!--            @update:search-text="-->
            <!--                (updatedSearchText) => {-->
            <!--                  setSelectedFile(null);-->
            <!--                  fileListSearchText = updatedSearchText;-->
            <!--                  // searchFiles();-->
            <!--                }-->
            <!--              "-->
            <!--            :required="true"-->
            <!--              v-model:selected="selectedFile"-->
          </va-inner-loading>
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
              :disabled="step === 0 || submitAttempted"
            >
              Previous
            </va-button>
            <va-button
              class="flex-none"
              @click="onNextClick(nextStep)"
              :color="isLastStep ? 'success' : 'primary'"
              :disabled="formHasErrors || submissionSuccess"
            >
              <!--            :disabled="!isFormValid()"-->
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

const STEP_KEYS = {
  NAME: "name",
  FILE_TYPE: "fileType",
  RAW_DATA: "rawData",
  DIRECTORY: "directory",
};

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

const formErrors = ref({
  [STEP_KEYS.NAME]: null,
  [STEP_KEYS.DIRECTORY]: null,
  [STEP_KEYS.RAW_DATA]: null,
  [STEP_KEYS.DIRECTORY]: null,
});
const formHasErrors = computed(() => {
  return Object.values(formErrors.value).some((error) => !!error);
});

const isFileSearchAutocompleteOpen = ref(false);

const selectedFile = ref(null);

const setSubmissionError = () => {
  console.log("selectedFile:", selectedFile.value);
  console.log("fileListSearchText:", fileListSearchText.value);

  if (isFileSearchAutocompleteOpen.value) {
    formErrors.value[STEP_KEYS.DIRECTORY] = null;
    return;
  }

  if (!selectedFile.value || !fileListSearchText.value.split(" ").join) {
    console.log("Selected file or fileListSearchText is null.");
    formErrors.value[STEP_KEYS.DIRECTORY] =
      "A file must be selected for ingestion.";
    return;
  }
  const restricted_dataset_paths = Object.values(
    config.restricted_ingestion_dirs,
  )
    .map((paths) => paths.split(","))
    .flat();
  console.log("restricted_dataset_paths:", restricted_dataset_paths);
  console.log("selectedFile.value.path:", selectedFile.value.path);
  const origin_path_is_restricted = restricted_dataset_paths.some((path) => {
    console.log("regex path:", path);
    // const regex = new RegExp(path);
    return selectedFile.value.path === path;
    // ? true
    // : regex.test(selectedFile.value.path);
  });
  // const restricted_paths = restricted_dataset_paths.map((paths) => {
  //   const restricted_path_patterns = paths.split(',');
  //
  //   const regex = new RegExp(paths);
  //   return regex.match(paths);
  // });
  // console.log('restricted paths:', restricted_paths);

  if (origin_path_is_restricted) {
    formErrors.value[STEP_KEYS.DIRECTORY] =
      "Selected file cannot be ingested as a dataset";
  } else {
    formErrors.value[STEP_KEYS.DIRECTORY] = null;
  }
};

const FILESYSTEM_SEARCH_SPACES = (config.filesystem_search_spaces || []).map(
  (space) => space[Object.keys(space)[0]],
);

const searchSpace = ref(
  FILESYSTEM_SEARCH_SPACES instanceof Array &&
    FILESYSTEM_SEARCH_SPACES.length > 0
    ? FILESYSTEM_SEARCH_SPACES[0]
    : "",
);

console.log("searchSpace.value: ", searchSpace.value);
const searchSpaceBasePath = computed({
  get: () => searchSpace.value.base_path,
  set: (value) => {
    console.log("set: () => searchSpace.value: ", value);
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
const rawDataSelected = ref();

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
  console.log("Searching for files matching:", fileListSearchText.value);

  const _searchText =
    (searchSpace.value.base_path.endsWith("/")
      ? searchSpace.value.base_path
      : searchSpace.value.base_path + "/") + fileListSearchText.value;
  console.log("_searchText: ", _searchText);

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
      // emit("loaded", loading.value);
    });
};

const setRetrievedFiles = (files) => {
  // selectedFile.value = null;
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
      datasetService
        .getAll({ type: "DATA_PRODUCT", name: value, match_name_exact: true })
        .then((res) => {
          resolve(
            res.data.datasets.length !== 0
              ? "Data Product with provided name already exists"
              : true,
          );
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
    });
};

const onSubmit = () => {
  if (!selectedFile.value) {
    setSubmissionError();
    return Promise.reject("No file selected for ingestion");
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

watch([selectedFile, fileListSearchText, isFileSearchAutocompleteOpen], () => {
  console.log("watch, setSubmissionError()");
  setSubmissionError();
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
</script>

<style lang="scss" scoped>
.stepper {
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
