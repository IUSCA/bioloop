<template>
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
        <button
          class="step-button p-1 sm:p-3 cursor-pointer"
          :class="{
            'step-button--active': isActive,
            'step-button--completed': isCompleted,
          }"
          @click="isFormValid() && setStep(i)"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="step.icon" />
            <span class="hidden sm:block"> {{ step.label }} </span>
          </div>
        </button>
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
            v-model="v.ref"
            @file-type-created="
              (newFileType) => {
                fileTypeList.push(newFileType);
              }
            "
            :allow-create-new="
              submissionStatus === SUBMISSION_STATES.UNINITIATED
            "
            :file-type-list="fileTypeList"
          />
        </va-form-field>
      </template>

      <template #step-content-2>
        <va-form-field
          v-model="rawDataSelected"
          v-slot="{ value: v }"
          :rules="[
            (v) => {
              return typeof v.length > 0 || 'Source dataset is required';
            },
          ]"
        >
          <DatasetSelect
            :selected-results="v.ref"
            @select="addDataset"
            @remove="removeDataset"
            :column-widths="columnWidths"
            select-mode="single"
          ></DatasetSelect>
        </va-form-field>

        <div v-if="isDirty" class="mt-2">
          <p v-for="error in errorMessages" :key="error">
            {{ error }}
          </p>
        </div>
      </template>

      <template #step-content-3>
        <va-inner-loading :loading="loading">
          <FileListAutoComplete
            v-model:selected="selectedFile"
            :required="true"
          />
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
            @click="isFormValid() && onNextClick(nextStep)"
            :color="isLastStep ? 'success' : 'primary'"
            :disabled="!isFormValid()"
          >
            {{ isLastStep ? "Ingest" : "Next" }}
          </va-button>
        </div>
      </template>
    </va-stepper>
  </va-form>
</template>

<script setup>
import datasetService from "@/services/dataset";
import config from "@/config";
import dataImportService from "@/services/dataImport";
import { useForm } from "vuestic-ui";
import toast from "@/services/toast";

const { SUBMISSION_STATES } = config;

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

const steps = [
  { label: "Path", icon: "mdi:folder" },
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Source Raw Data", icon: "mdi:dna" },
];

const selectedFile = ref({});
const filePath = computed(() =>
  Object.keys(selectedFile.value).length > 0 ? selectedFile.value.path : "",
);

// watch(selectedFile, () => {
//   console.log("DataProductIngestionStepper, WATCH():");
//   console.log(`selectedFile.value`);
//   console.log(selectedFile.value);
// });
const submissionStatus = ref(SUBMISSION_STATES.UNINITIATED);
const fileTypeSelected = ref();
const fileTypeList = ref([]);
const rawDataSelected = ref();
const rawDataSelected_search = ref("");

const datasetName = ref("");
const loading = ref(false);
const filesInPath = ref([]);
const statusChipColor = ref();
const submissionAlert = ref(); // For handling network errors before upload begins
const submissionAlertColor = ref();
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const dataProductFiles = ref([]);
const rawDataList = ref([]);
const step = ref(0);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});

const { isValid, validate } = useForm("dataProductIngestionForm");

const addDataset = (selectedDatasets) => {
  rawDataSelected.value = selectedDatasets;
};

const removeDataset = () => {
  rawDataSelected.value = [];
};

const isFormValid = () => {
  // validate();

  // console.log("isFormValid() says");
  // console.log(`filePath.value`);
  // console.log(filePath.value);
  return typeof filePath.value === "string" && filePath.value.trim() !== "";
  // return false;
};

const handleSubmit = () => {};

const onNextClick = (nextStep) => {
  if (isLastStep.value && isValid.value) {
    handleSubmit();
  } else {
    nextStep();
  }
};

// Log (or update) upload status

onMounted(() => {
  datasetService.getDatasetFileTypes().then((res) => {
    fileTypeList.value = res.data;
  });
  datasetService.getAll({ type: "RAW_DATA" }).then((res) => {
    rawDataList.value = res.data.datasets;
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
