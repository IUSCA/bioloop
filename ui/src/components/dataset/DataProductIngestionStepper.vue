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
        <va-input
          label="Data Product Path"
          placeholder="Path"
          v-model="dataProductPath"
          class="w-full"
          :rules="[
            (value) => {
              return (value && value.length > 0) || 'Path is required';
            },
          ]"
        />
      </template>

      <template #step-content-1>
        <DataProductFileTypeSelect
          v-model="fileTypeSelected"
          :file-type-list="fileTypeList"
          class="w-full"
          @new-file-type-created="
            (newFileType) => {
              // if a new File Type has already been created, remove it
              const currentNewFileType = fileTypeList.find(
                (e) => e.id === null,
              );
              if (currentNewFileType) {
                fileTypeList.pop();
              }
              fileTypeList.push(newFileType);
            }
          "
        />
      </template>

      <template #step-content-2>
        <va-select
          name="raw_data"
          v-model="rawDataSelected"
          v-model:search="rawDataSelected_search"
          autocomplete
          class="w-full raw_data_select"
          label="Source Raw Data"
          placeholder="Raw Data"
          :options="rawDataList"
          :text-by="(option) => option.name"
          :rules="[
            (value) => {
              return (
                (value && value.name.length > 0) ||
                'Source Raw Data is required'
              );
            },
          ]"
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
            @click="isFormValid() && onNextClick(nextStep)"
            :color="isLastStep ? 'success' : 'primary'"
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
import { useForm } from "vuestic-ui";

const steps = [
  { label: "Path", icon: "mdi:folder" },
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Select Files", icon: "material-symbols:folder" },
];

const dataProductPath = ref("");
const fileTypeSelected = ref();
const fileTypeList = ref([]);
const rawDataSelected = ref();
const rawDataSelected_search = ref("");

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
// const formData = computed(() => {
//   return {
//     data_product_name: dataProductPath.value,
//     source_dataset_id: rawDataSelected.value.id,
//     file_type: fileTypeSelected.value,
//   };
// });

const { isValid, validate } = useForm("dataProductIngestionForm");

const isFormValid = () => {
  validate();
  return isValid.value;
};

const handleSubmit = () => {};

const onNextClick = (nextStep) => {
  if (isLastStep.value && isValid.value) {
    handleSubmit();
  } else {
    nextStep();
  }
};

// Evaluates selected file checksums, logs the upload

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
