<template>
  <!-- todo
      disable submission/moving to next step when return pressed
 -->
  <va-form ref="datasetUploadForm" class="h-full">
    <va-stepper
      v-model="step"
      :steps="steps"
      controlsHidden
      class="h-full create-data-product-stepper"
    >
      <!-- Step icons and labels -->
      <template
        v-for="(step, i) in steps"
        :key="step.label"
        #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
      >
        <div
          class="step-button p-1 sm:p-3 cursor-pointer"
          :class="{
            'step-button--active': isActive,
            'step-button--completed': isCompleted,
          }"
          role="button"
          tabindex="0"
          @click="setStep(i)"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="step.icon" />
            <span class="hidden sm:block"> {{ step.label }} </span>
          </div>
        </div>
      </template>

      <template #step-content-0>
        <va-form-field
          v-model="datasetName"
          :rules="[
            (v) => v.length >= 3 || 'Min length is 3 characters',
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
            :allow-create-new="true"
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
          ></DatasetSelect>
        </va-form-field>

        <div v-if="isDirty" class="mt-2">
          <p v-for="error in errorMessages" :key="error">
            {{ error }}
          </p>
        </div>
      </template>

      <template #step-content-3>
        <DatasetFileUploadTable
          :file-type="fileTypeSelected"
          :source-raw-data="rawDataSelected[0]"
          :dataset-name="datasetName"
          :status-chip-color="statusChipColor"
          :submission-status="submissionStatus"
          :is-submission-alert-visible="isSubmissionAlertVisible"
          :submission-alert="submissionAlert"
          @file-added="
            (files) => {
              console.log('Stepper - files');
              console.log(files);

              setFiles(files);
              isSubmissionAlertVisible = false;
            }
          "
          @remove-file="removeFile"
          :submit-attempted="submitAttempted"
          :submission-alert-color="submissionAlertColor"
          :data-product-files="dataProductFiles"
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
            :disabled="step === 0 || submitAttempted"
          >
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="onNextClick(nextStep)"
            :color="isLastStep ? 'success' : 'primary'"
            :disabled="!isSubmitEnabled"
          >
            {{
              isLastStep
                ? submissionStatus === SUBMISSION_STATES.UPLOAD_FAILED
                  ? "Retry Uploading Failed Files"
                  : "Upload Files"
                : "Next"
            }}
          </va-button>
        </div>
      </template>
    </va-stepper>
  </va-form>
</template>

<script setup>
import SparkMD5 from "spark-md5";
import _ from "lodash";
import datasetService from "@/services/dataset";
import uploadService from "@/services/uploads";
import { useAuthStore } from "@/stores/auth";
import { formatBytes } from "@/services/utils";
import { useForm, useBreakpoint } from "vuestic-ui";
import config from "@/config";
import { useDatasetUploadFormStore } from "@/stores/datasetUploadForm";
import { storeToRefs } from "pinia";
import DatasetFileUploadTable from "@/components/dataset/upload/DatasetFileUploadTable.vue";

const auth = useAuthStore();
const breakpoint = useBreakpoint();

const { SUBMISSION_STATES } = config;

const { errorMessages, isDirty } = useForm("datasetUploadForm");

// watch(errorMessages, () => {
//   console.log("errorMessages");
//   console.log(errorMessages.value);
// });

const columnWidths = computed(() => {
  return {
    name: breakpoint.xs || breakpoint.sm ? "230px" : "190px",
    type: "130px",
    size: "100px",
    created_at: "105px",
  };
});

const steps = [
  { label: "Name", icon: "material-symbols:description-outline" },
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Select Files", icon: "material-symbols:folder" },
];

const datasetName = ref("");
// const dataProductName = ref("");
const fileTypeSelected = ref(null);
const fileTypeList = ref([]);
const rawDataList = ref([]);
const rawDataSelected = ref([]);
const rawDataSelected_search = ref("");
const uploadLog = ref();
const submissionStatus = ref(SUBMISSION_STATES.UNINITIATED);
const statusChipColor = ref();
const submissionAlert = ref(); // For handling network errors before upload begins
const submissionAlertColor = ref();
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const dataProductFiles = ref([]);
const step = ref(0);

const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});
const isSubmitEnabled = computed(() => {
  return (
    submissionStatus.value === SUBMISSION_STATES.UNINITIATED ||
    submissionStatus.value === SUBMISSION_STATES.PROCESSING_FAILED ||
    submissionStatus.value === SUBMISSION_STATES.UPLOAD_FAILED
  );
});
const noFilesSelected = computed(() => {
  return dataProductFiles.value.length === 0;
});

const addDataset = (selectedDatasets) => {
  rawDataSelected.value = selectedDatasets;
};

const removeDataset = () => {
  rawDataSelected.value = [];
};

const setFiles = (files) => {
  _.range(0, files.length).forEach((i) => {
    const file = files.item(i);
    dataProductFiles.value.push({
      file: file,
      name: file.name,
      formattedSize: formatBytes(file.size),
      progress: undefined,
    });
  });
};

const removeFile = (index) => {
  dataProductFiles.value.splice(index, 1);
};

const onNextClick = (nextStep) => {
  console.log("onNextClick", nextStep);
  if (isLastStep.value) {
    if (noFilesSelected.value) {
      isSubmissionAlertVisible.value = true;
      submissionAlert.value =
        "At least one file must be selected to create a Data Product";
      submissionAlertColor.value = "warning";
    } else {
      // handleSubmit();
    }
  } else {
    nextStep();
  }
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

onMounted(() => {
  datasetService.getDatasetFileTypes().then((res) => {
    fileTypeList.value = res.data;
  });
  datasetService.getAll({ type: "RAW_DATA" }).then((res) => {
    rawDataList.value = res.data.datasets;
  });
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
}
</style>
