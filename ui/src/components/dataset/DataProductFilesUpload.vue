<template>
  <va-form ref="data_product_upload_form" class="h-full">
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
          @click="isValid_new_data_product_form() && setStep(i)"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="step.icon" />
            <span class="hidden sm:block"> {{ step.label }} </span>
          </div>
        </div>
      </template>

      <template #step-content-0>
        <va-input
          label="Data Product Name"
          placeholder="Name"
          v-model="dataProductName"
          class="w-full"
          :rules="[
            (value) => {
              return (value && value.length > 0) || 'Name is required';
            },
            (value) => {
              return (
                (value && value.length > 2) ||
                'Name must be 3 or more characters'
              );
            },
            validateNotExists,
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
              const currentNewFileType = fileTypeList.find((e) => !e.id);
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
          v-model="rawDataSelected"
          v-model:search="rawDataSelected_search"
          autocomplete
          class="w-full"
          label="Source Raw Data"
          placeholder="Raw Data"
          :options="raw_data_list"
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

      <template #step-content-3>
        <div class="flex-none">
          <va-file-upload
            class="w-full"
            label="File"
            dropzone
            @file-added="setFiles"
            :disabled="areControlsDisabled"
          />

          <va-data-table
            v-if="dataProductFiles.length > 0"
            :items="dataProductFiles"
            :columns="columns"
          >
            <template #cell(progress)="{ value }">
              <va-progress-circle :model-value="value" size="small">
                {{ value && value + "%" }}
              </va-progress-circle>
            </template>

            <template #cell(processingStatus)="{ value }">
              <span class="flex justify-center">
                <va-popover
                  v-if="value === FILE_STATUS.PROCESSED"
                  message="Succeeded"
                >
                  <va-icon name="check_circle_outline" color="success" />
                </va-popover>
                <va-popover
                  v-if="value === FILE_STATUS.PROCESSING"
                  message="Pending"
                >
                  <va-icon name="pending" color="info" />
                </va-popover>
                <va-popover
                  v-if="value === FILE_STATUS.FAILED"
                  message="Failed"
                >
                  <va-icon name="error_outline" color="danger" />
                </va-popover>
              </span>
            </template>

            <template #cell(actions)="{ rowIndex }">
              <div class="flex gap-1">
                <va-button
                  preset="plain"
                  icon="delete"
                  color="danger"
                  @click="removeFile(rowIndex)"
                  :disabled="areControlsDisabled"
                />
                <va-popover message="Retry upload">
                  <va-button
                    preset="plain"
                    icon="refresh"
                    color="info"
                    @click="uploadFile(dataProductFiles[rowIndex])"
                    :disabled="
                      dataProductFiles[rowIndex].processingStatus !==
                      FILE_STATUS.FAILED
                    "
                  />
                </va-popover>
              </div>
            </template>
          </va-data-table>
        </div>
      </template>

      <!-- custom controls -->
      <template #controls="{ nextStep, prevStep }">
        <div class="flex items-center justify-around w-full">
          <va-button class="flex-none" preset="primary" @click="prevStep()">
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="
              isValid_new_data_product_form() &&
                (is_last_step ? handleSubmit() : nextStep())
            "
            :color="is_last_step ? 'success' : 'primary'"
          >
            {{ is_last_step ? "Create Data Product" : "Next" }}
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
import { formatBytes } from "@/services/utils";
import { useForm } from "vuestic-ui";

const STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
};
const FILE_STATUS = {
  PROCESSING: "Processing",
  PROCESSED: "Processed",
  FAILED: "Processing Failed",
};
const RETRY_COUNT_THRESHOLD = 5;
const CHUNK_SIZE = 2 * 1024 * 1024; // Size of each chunk, set to 2 Mb
// Blob.slice method is used to segment files.
// At the same time, this method is used in different browsers in different ways.
const blobSlice =
  File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
const columns = [
  { key: "name" },
  { key: "formattedSize", label: "Size" },
  {
    key: "processingStatus",
    label: "Status",
    thAlign: "center",
    tdAlign: "center",
  },
  { key: "progress" },
  { key: "actions", width: "80px" },
];
const steps = [
  { label: "Name", icon: "material-symbols:description-outline" },
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Select File", icon: "material-symbols:folder" },
];

const dataProductName = ref("");
const fileTypeSelected = ref();
const fileTypeList = ref([]);
const rawDataSelected = ref();
const rawDataSelected_search = ref("");
const status = ref();
const inProgress = computed(() => status.value === STATUS.IN_PROGRESS);
const areControlsDisabled = computed(
  () => status.value === STATUS.IN_PROGRESS || status.value === STATUS.COMPLETE,
);
const dataProductFiles = ref([]);
const raw_data_list = ref([]);

const step = ref(0);
const is_last_step = computed(() => {
  return step.value === steps.length - 1;
});

const {
  isValid: isValid_data_product_upload_form,
  validate: validate_data_product_upload_form,
} = useForm("data_product_upload_form");

const hashFile = (file) => {
  return new Promise((resolve) => {
    let currentChunk = 0;
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const buffer = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    function loadNext() {
      const start = currentChunk * CHUNK_SIZE;
      const end =
        start + CHUNK_SIZE >= file.size ? file.size : start + CHUNK_SIZE;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    fileReader.onload = (e) => {
      buffer.append(e.target.result); // Append to array buffer
      currentChunk += 1;
      if (currentChunk < chunks) {
        loadNext();
      } else {
        const result = buffer.end();
        // Add file's name to the generated hash, in case two files have the same content but
        // different names
        const sparkMd5 = new SparkMD5();
        sparkMd5.append(result);
        sparkMd5.append(file.name);
        const hexHash = sparkMd5.end();
        resolve(hexHash);
      }
    };

    fileReader.onerror = () => {
      console.warn("file reading failed! ");
    };

    loadNext();
  }).catch((err) => {
    console.log(err);
  });
};

const uploadFile = async (fileDetails) => {
  fileDetails.processingStatus = FILE_STATUS.PROCESSING;

  let file = fileDetails.file;
  console.log(`Beginning upload of file ${file.name}`);

  const blockCount = Math.ceil(file.size / CHUNK_SIZE); // total number of fragments
  const hash = await hashFile(file);

  for (let i = 0; i < blockCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);

    // Building form data
    const form = new FormData();
    // If the request's body needs to be accessed before the request's file, the body's fields
    // should be set before the `file` field.
    form.append("hash", hash);
    form.append("name", file.name);
    form.append("total", blockCount);
    form.append("index", i);
    form.append("size", file.size);
    form.append("dataProduct", dataProductName.value);
    form.append("file", blobSlice.call(file, start, end));

    fileDetails.progress = Math.trunc(((i + 1) / blockCount) * 100);

    // Upload/retry uploading each chunk for current file
    let retryCount = 0;
    console.log(`trying to upload chunk ${i} for file ${file.name}`);
    let chunkUploaded = await uploadChunk(form);
    while (!chunkUploaded && retryCount < RETRY_COUNT_THRESHOLD) {
      console.log(
        `Upload failed. Retrying to upload chunk ${i} for file ${file.name}`,
      );
      chunkUploaded = await uploadChunk(form);
      retryCount++;
    }

    if (!chunkUploaded) {
      console.log(
        `Exceeded retry threshold while trying to upload chunk ${i} for file ${file.name}.`,
      );
      fileDetails.processingStatus = FILE_STATUS.FAILED;
      delete fileDetails.progress;

      break;
    }
  }

  if (fileDetails.processingStatus !== FILE_STATUS.FAILED) {
    fileDetails.processingStatus = FILE_STATUS.PROCESSED;
  }

  const statusLog =
    fileDetails.processingStatus === FILE_STATUS.FAILED
      ? `Upload of file ${file.name} failed`
      : `Upload of file ${file.name} was successful`;
  console.log(statusLog);
};

const handleSubmit = async () => {
  await uploadFiles();
};

const uploadFiles = async () => {
  status.value = STATUS.IN_PROGRESS;

  for (let f = 0; f < dataProductFiles.value.length; f++) {
    let fileDetails = dataProductFiles.value[f];
    await uploadFile(fileDetails);

    if (f < dataProductFiles.value.length - 1) {
      console.log(`Proceeding to next file`);
    }
  }

  status.value = STATUS.COMPLETE;
};

const uploadChunk = async (data) => {
  try {
    await datasetService.uploadFileChunk(data);
    return true;
  } catch (e) {
    return false;
  }
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

function isValid_new_data_product_form() {
  // debugger;
  validate_data_product_upload_form();
  return isValid_data_product_upload_form.value;
}

const validateNotExists = (value) => {
  return new Promise((resolve) => {
    // Vuestic claims that it should not run async validation if synchronous validation fails,
    // but it seems to be triggering async validation nonetheless when `value` is empty. Hence
    // the explicit check for whether `value` is falsy.
    if (!value) {
      resolve(true);
    } else {
      datasetService
        .getAll({ type: "DATA_PRODUCT", name: value, match_name_exact: true })
        .then((res) => {
          const dataProducts = res.data.datasets;
          const matchingDataProductFound = dataProducts.some(
            (e) => e.name === value,
          );
          resolve(
            matchingDataProductFound
              ? "Data Product with provided name already exists"
              : true,
          );
        });
    }
  });
};

onMounted(() => {
  datasetService.getDataProductFileTypes().then((res) => {
    // debugger;
    fileTypeList.value = res.data;
  });
});

onMounted(() => {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
  window.addEventListener("beforeunload", (e) => {
    if (inProgress.value) {
      // show warning before user leaves page
      e.returnValue = true;
    }
  });
});

onMounted(() => {
  datasetService.getAll({ type: "DATA_PRODUCT" }).then((res) => {
    raw_data_list.value = res.data.datasets;
  });
});

// show warning before user moves to a different route
onBeforeRouteLeave(() => {
  const answer = window.confirm(
    "Leaving this page before all files have been processed/uploaded will" +
      " cancel the upload. Do you wish to continue?",
  );
  if (!answer) return false;
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

  .va-table td {
    padding: 0.25rem;
  }

  div.va-table-responsive {
    overflow: auto;

    // first column min width
    td:first-child {
      min-width: 135px;
    }
  }
}
</style>
