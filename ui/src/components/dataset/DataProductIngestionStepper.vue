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
              class="w-full"
              v-model="v.ref"
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
            <FileListAutoComplete
              class="w-full"
              @select="
                (newFile) => {
                  setSelectedFile(newFile);
                }
              "
              @files-retrieved="setRetrievedFiles"
              :disabled="submitAttempted"
              :base-path="config.dataset_ingestion_source_dir"
            />

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
  { label: "Name", icon: "material-symbols:description-outline" },
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Select Directory", icon: "material-symbols:folder" },
];

const filePath = ref("");

const selectedFile = ref(null);
// const filePath = computed(() =>
//   Object.keys(selectedFile.value).length > 0 ? selectedFile.value.path : "",
// );

const setSelectedFile = (file) => {
  console.log("Selected file:", file);
  selectedFile.value = file;
  fileList.value = [selectedFile.value];
  // fileList.value = [selectedFile.value];
};

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

const setRetrievedFiles = (files) => {
  fileList.value = files;
};

const searchFiles = async () => {
  if (fileListSearchText.value.trim() === "") {
    return;
  }

  loading.value = true;
  ingestionService
    .getPathFiles({
      path: fileListSearchText.value,
    })
    .then((response) => {
      fileList.value = response.data;
      console.log("retrieved file list");
      console.log(fileList.value);
    })
    .catch((error) => {
      toast.error("Error fetching files from the provided path");
      console.error(error);
    })
    .finally(() => {
      loading.value = false;
    });
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
