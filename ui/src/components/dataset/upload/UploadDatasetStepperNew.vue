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
          v-slot="{ value: v }"
          v-model="datasetName"
          :rules="[(v) => v.length >= 3 || 'Min length is 3 characters']"
        >
          <DatasetNameInput
            label="Dataset Name"
            placeholder="Dataset Name"
            v-model="v.ref"
            class="w-full"
          />
        </va-form-field>
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
import { useForm } from "vuestic-ui";
import config from "@/config";
import { useDatasetUploadFormStore } from "@/stores/datasetUploadForm";
import { storeToRefs } from "pinia";

const auth = useAuthStore();

const { errorMessages, isDirty } = useForm("datasetUploadForm");

// const { formData } = useForm("datasetUploadForm");
const SUBMISSION_STATES = {
  UNINITIATED: "Uninitiated",
  PROCESSING: "Processing",
  PROCESSING_FAILED: "Processing Failed",
  UPLOADING: "Uploading",
  UPLOAD_FAILED: "Upload Failed",
  UPLOADED: "Uploaded",
};

const steps = [
  { label: "Name", icon: "material-symbols:description-outline" },
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Select Files", icon: "material-symbols:folder" },
];

const datasetName = ref("");
// const dataProductName = ref("");
// const fileTypeSelected = ref();
// const fileTypeList = ref([]);
// const rawDataSelected = ref();
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
