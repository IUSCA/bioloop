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

        <template #step-content-3>
          <va-form-field
            v-model="datasetName"
            :rules="[
              (v) => v.length >= 3 || 'Min length is 3 characters',
              // (v) => v?.indexof(' ') === -1 || 'Name cannot contain spaces',
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

        <template #step-content-0>
          <!--          <va-input class="w-full" v-model="filePath" />-->

          <va-inner-loading :loading="loading">
            <!--              @update:selected-file="(file) => setSelectedFile(file)"-->
            <!--              v-model:selected-file="selectedFile"-->
            <div class="flex">
              <va-select
                class="mr-2"
                v-model="searchSpace"
                @update:modelValue="
                  () => {
                    fileListSearchText = '';
                    setRetrievedFiles([]);
                  }
                "
                :options="filesystemSearchSpaces"
                :text-by="'label'"
                label="Search space"
              />

              <FileListAutoComplete
                class="w-full"
                @files-retrieved="setRetrievedFiles"
                :disabled="submitAttempted"
                :base-path="base_path"
                @loading="loading = true"
                @loaded="loading = false"
                @clear="setRetrievedFiles"
                v-model:selected="selectedFile"
                @update:selected="
                  (file) => {
                    console.log('@update:selected, Selected file:', file);
                    selectedFile = file;
                    console.log('Selected file:', selectedFile);
                  }
                "
                v-model:search-text="fileListSearchText"
                @update:search-text="searchFiles"
                :options="fileList"
              />
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
              :disabled="submissionSuccess"
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
import ingestionService from "@/services/ingest";
import toast from "@/services/toast";
import { useForm } from "vuestic-ui";

const { errorMessages, isDirty } = useForm("dataProductIngestionForm");

const steps = [
  // { label: "Name", icon: "material-symbols:description-outline" },
  // { label: "File Type", icon: "material-symbols:category" },
  // { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Select Directory", icon: "material-symbols:folder" },
];

const filePath = ref("");

const selectedFile = ref(null);
// const filePath = computed(() =>
//   Object.keys(selectedFile.value).length > 0 ? selectedFile.value.path : "",
// );

// const setSelectedFile = (file) => {
//   console.log("Selected file:", file);
//   selectedFile.value = file;
//   fileList.value = [selectedFile.value];
//   // fileList.value = [selectedFile.value];
// };

console.log(config.filesystem_search_spaces);
const filesystemSearchLabels = (config.filesystem_search_spaces || []).map(
  (space) => space[Object.keys(space)[0]]?.label,
  // x: "y",
);

const filesystemSearchSpaces = (config.filesystem_search_spaces || []).map(
  (space) => space[Object.keys(space)[0]],
  // x: "y",
);
// const filesystemSearchSpaces = [];

console.log(
  "fileSystemSpaces.value: ",
  filesystemSearchSpaces,
  filesystemSearchSpaces instanceof Array,
);
// const searchSpace=computed(() => filesystemSearchSpaces.value[0])
console.log(
  "fileSystemSearchSpaces.value[0]: ",
  filesystemSearchSpaces[0],
  // typeof filesystemSearchSpaces.value[0],
);
// const searchSpace = computed({
//   get: () => filesystemSearchSpaces[0],
//   set: (value) => {
//     filesystemSearchSpaces.value = [value];
//   },
// });
const searchSpace = ref(
  filesystemSearchSpaces instanceof Array && filesystemSearchSpaces.length > 0
    ? filesystemSearchSpaces[0]
    : "",
);

console.log("searchSpace.value: ", searchSpace.value);
const base_path = computed({
  get: () => searchSpace.value.base_path,
  set: (value) => {
    console.log("set: () => searchSpace.value: ", value);
    searchSpace.value = value;
    fileListSearchText.value = "";
    setRetrievedFiles([]);
  },
})


// const searchSpace = ref("");

// console.log("vute: ", import.meta.env.VITE_FILESYSTEM_SEARCH_SPACES);

const fileListSearchText = ref("");
const submitted = ref(false);
const submissionSuccess = ref(false);
const fileTypeSelected = ref();
const fileTypeList = ref([]);
const rawDataSelected = ref();
const rawDataSelected_search = ref("");

const fileList = ref([]);
const datasetId = ref();
const datasetName = ref("");
const loading = ref(false);
const filesInPath = ref([]);
const statusChipColor = ref();
const submissionAlert = ref(); // For handling network errors before upload begins
const submissionAlertColor = ref();
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const rawDataList = ref([]);
const step = ref(0);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

const searchFiles = async () => {
  console.log("Searching for files matching:", fileListSearchText.value);

   const _searchText =
    (searchSpace.value.base_path.endsWith("/")
      ? searchSpace.value.base_path
      : searchSpace.value.base_path + "/") + fileListSearchText.value;
  console.log("_searchText: ", _searchText);

  if (_searchText.trim() === "") {
    return;
  }

  loading.value = true;
  // emit("loading", loading.value);

  // const search_space_base_dir = (config.filesystem_search_spaces || []).find(
  //   (space) => space[searchSpace.value] === searchSpace.value,
  // )?.base_path;
  const search_space_mount_dir = (config.filesystem_search_spaces || []).find(
    (space) => {
      console.log("space: ", space);
      console.log("Object.keys(space)[0]: ", Object.keys(space)[0]);
      console.log("searchSpace", searchSpace.value.base_path);
      return Object.keys(space)[0] === searchSpace.value.base_path;
    },
  );
  // const base_dir = search_space_mount_dir[searchSpace].base_path;
  // const mount_path = search_space_mount_dir[searchSpace].mount_path;

  // const base_dir = search_space_mount_dir[searchSpace.value].base_path;
  // const mount_dir = search_space_mount_dir[searchSpace.value].mount_path;

  console.log("search_space_mount_dir: ", search_space_mount_dir);
  // console.log("search_space_mount_path: ",
  // search_space_mount_dir.mount_path);
  console.log(
    "search_space_mount_dir[searchSpace]",
    search_space_mount_dir[searchSpace.value],
  );

  ingestionService
    .getPathFiles({
      path: _searchText,
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

const initiateIngestion = () => {
  return datasetService
    .initiate_workflow_on_dataset({
      dataset_id: datasetId.value,
      workflow: "integrated",
    })
    .then(() => {
      submissionSuccess.value = true;
    });
};

const onSubmit = () => {
  submitAttempted.value = true;

  return new Promise((resolve, reject) => {
    preIngestion()
      .then(async (res) => {
        datasetId.value = res.data.id;
        const ingestionInitiated = await initiateIngestion();
        if (ingestionInitiated) {
          resolve();
        } else {
          reject(new Error("Unable to register the dataset"));
        }
      })
      .catch((err) => {
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

// Log (or update) upload status

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
