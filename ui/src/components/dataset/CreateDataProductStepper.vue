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
            (value) => {
              return value.indexOf(' ') === -1 || 'Name cannot contain spaces';
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
          name="raw_data"
          v-model="rawDataSelected"
          v-model:search="rawDataSelected_search"
          autocomplete
          class="w-full raw_data_select"
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
            upload-button-text="Select Files"
            drop-zone-text="Drop files here"
            dropzone
            @file-added="
              (files) => {
                setFiles(files);
                setFileUploadAlertVisibility(false);
              }
            "
            :disabled="isFormSubmitted"
          />

          <va-alert
            class="mt-4"
            v-if="isFileUploadAlertVisible"
            color="danger"
            border="left"
            dense
            >At least one file must be selected to create a Data Product
          </va-alert>

          <va-data-table
            v-if="!(isFileUploadAlertVisible || noFilesSelected)"
            :items="dataProductFiles"
            :columns="columns"
          >
            <template #cell(progress)="{ value }">
              <va-progress-circle :model-value="value" size="small">
                {{ value && value + "%" }}
              </va-progress-circle>
            </template>

            <template #cell(uploadStatus)="{ value }">
              <span class="flex justify-center">
                <va-popover
                  v-if="value === STATUS.UPLOADED"
                  message="Succeeded"
                >
                  <va-icon name="check_circle_outline" color="success" />
                </va-popover>
                <va-popover v-if="value === STATUS.UPLOADING" message="Pending">
                  <va-icon name="pending" color="info" />
                </va-popover>
                <va-popover v-if="value === STATUS.FAILED" message="Failed">
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
                  :disabled="isFormSubmitted"
                />
              </div>
            </template>
          </va-data-table>
        </div>

        <va-alert
          v-if="submissionError"
          class="mt-5"
          color="danger"
          border="left"
          dense
          >{{ submissionError }}
        </va-alert>

        <!-- Submitted values -->
        <va-card v-if="submittedDataset" class="mt-5">
          <va-card-title>
            <div class="flex flex-nowrap items-center w-full">
              <span class="text-lg">Details</span>
            </div>
          </va-card-title>
          <va-card-content>
            <div class="va-table-responsive">
              <table class="va-table">
                <tbody>
                  <tr>
                    <td>Status</td>
                    <td>
                      <va-chip size="small" :color="submissionStatusColor">
                        {{ submissionStatus }}
                      </va-chip>
                    </td>
                  </tr>
                  <tr>
                    <td>Data Product Name</td>
                    <td>{{ submittedDataset.name }}</td>
                  </tr>
                  <tr>
                    <td>File Type</td>
                    <td>
                      <va-chip outline small class="mr-2">{{
                        submittedDataset.file_type.name
                      }}</va-chip>
                      <va-chip outline small>{{
                        submittedDataset.file_type.extension
                      }}</va-chip>
                    </td>
                  </tr>
                  <tr>
                    <td>Source Raw Data</td>
                    <td>
                      <span>
                        <router-link
                          :to="`/datasets/${rawDataSelected.id}`"
                          target="_blank"
                        >
                          {{ rawDataSelected.name }}
                        </router-link>
                        <!--                        <a-->
                        <!--                          :href="`/datasets/${submittedDataset.source_datasets[0].source_dataset.id}`"-->
                        <!--                          target="_blank"-->
                        <!--                        >-->
                        <!--                          {{-->
                        <!--                            submittedDataset.source_datasets[0].source_dataset-->
                        <!--                              .name-->
                        <!--                          }}-->
                        <!--                        </a>-->
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </va-card-content>
        </va-card>
      </template>

      <!-- custom controls -->
      <template #controls="{ nextStep, prevStep }">
        <div class="flex items-center justify-around w-full">
          <va-button
            class="flex-none"
            preset="primary"
            @click="
              () => {
                setFileUploadAlertVisibility(false);
                prevStep();
              }
            "
            :disabled="step === 0 || isFormSubmitted"
          >
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="isValid_new_data_product_form() && onNextClick(nextStep)"
            :color="is_last_step ? 'success' : 'primary'"
            :disabled="
              is_last_step &&
              (form_status === STATUS.UPLOADING ||
                form_status === STATUS.UPLOADED)
            "
          >
            {{
              is_last_step
                ? someUploadsFailed
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
import { formatBytes } from "@/services/utils";
import { useForm } from "vuestic-ui";
import config from "@/config";

const STATUS = {
  UPLOADING: "Uploading",
  UPLOADED: "Uploaded",
  FAILED: "Upload Failed",
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
    key: "uploadStatus",
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
const submittedDataset = ref();
const form_status = ref();
const submissionStatus = ref();
const submissionError = ref(""); // For handling network errors before upload begins
const inProgress = computed(() => form_status.value === STATUS.UPLOADING);
const dataProductFiles = ref([]);
const failedFiles = computed(() => {
  return dataProductFiles.value.filter((e) => e.uploadStatus === STATUS.FAILED);
});
const someUploadsFailed = ref(false);
const submissionStatusColor = computed(() => {
  if (
    submissionStatus.value === config.upload_status.PROCESSING ||
    submissionStatus.value === config.upload_status.UPLOADING
  ) {
    return "primary";
  }
  if (submissionStatus.value === config.upload_status.COMPLETE) {
    return "success";
  }
  if (submissionStatus.value === config.upload_status.UPLOAD_FAILED) {
    return "warning";
  }
});

const raw_data_list = ref([]);
const step = ref(0);
const is_last_step = computed(() => {
  return step.value === steps.length - 1;
});

const isFileUploadAlertVisible = ref(false);
const noFilesSelected = computed(() => {
  return dataProductFiles.value.length === 0;
});

const {
  isValid: isValid_data_product_upload_form,
  validate: validate_data_product_upload_form,
} = useForm("data_product_upload_form");

const hashFile = (file) => {
  return new Promise((resolve) => {
    let chunkIndex = 0;
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const buffer = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();
    const chunkChecksums = [];

    function loadNext() {
      const start = chunkIndex * CHUNK_SIZE;
      const end =
        start + CHUNK_SIZE >= file.size ? file.size : start + CHUNK_SIZE;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    fileReader.onload = (e) => {
      const result = e.target.result;
      const chunkHash = SparkMD5.ArrayBuffer.hash(result);
      chunkChecksums.push(chunkHash);

      buffer.append(result); // Append to array buffer

      chunkIndex += 1;
      if (chunkIndex < chunks) {
        loadNext();
      } else {
        resolve({
          fileChecksum: buffer.end(),
          chunkChecksums,
        });
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

const evaluateChecksums = () => {
  const promises = [];

  try {
    for (let i = 0; i < dataProductFiles.value.length; i++) {
      let fileDetails = dataProductFiles.value[i];
      const file = fileDetails.file;

      promises.push(
        hashFile(file).then(({ fileChecksum, chunkChecksums }) => {
          fileDetails.fileChecksum = fileChecksum;
          fileDetails.chunkChecksums = chunkChecksums;
          fileDetails.numChunks = Math.ceil(file.size / CHUNK_SIZE); // total number of fragments
          return true;
        }),
      );
    }
  } catch (e) {
    console.log("Error occurred during checksum evaluation", e);
  }

  return Promise.all(promises);
};

const uploadFile = async (fileDetails) => {
  fileDetails.uploadStatus = STATUS.UPLOADING;

  let file = fileDetails.file;
  console.log(`Beginning upload of file ${file.name}`);

  const blockCount = fileDetails.numChunks;

  for (let i = 0; i < blockCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);

    const fileData = blobSlice.call(file, start, end);
    // Building form data
    const form = new FormData();
    // If the request's body needs to be accessed before the request's file, the body's fields
    // should be set before the `file` field.
    form.append("file_checksum", fileDetails.fileChecksum);
    form.append("name", fileDetails.name);
    form.append("total", blockCount);
    form.append("index", i);
    form.append("size", file.size);
    form.append("data_product_name", dataProductName.value);
    form.append("chunk_checksum", fileDetails.chunkChecksums[i]);
    form.append("file", fileData);

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
      fileDetails.uploadStatus = STATUS.FAILED;
      delete fileDetails.progress;

      break;
    }
  }

  if (fileDetails.uploadStatus !== STATUS.FAILED) {
    fileDetails.uploadStatus = STATUS.UPLOADED;
  }

  const statusLog =
    fileDetails.uploadStatus === STATUS.FAILED
      ? `Upload of file ${file.name} failed`
      : `Upload of file ${file.name} was successful`;
  console.log(statusLog);
};

const onNextClick = (nextStep) => {
  if (is_last_step.value) {
    if (noFilesSelected.value) {
      setFileUploadAlertVisibility(true);
    } else {
      if (isValid_new_data_product_form()) {
        handleSubmit();
      }
    }
  } else {
    setFileUploadAlertVisibility(false);
    nextStep();
  }
};

const setFileUploadAlertVisibility = (val) => {
  isFileUploadAlertVisible.value = val;
};

const formData = computed(() => {
  return {
    data_product_name: dataProductName.value,
    source_dataset_id: rawDataSelected.value.id,
    file_type: fileTypeSelected.value,
  };
});

const isFormSubmitted = ref(false);

const handleSubmit = () => {
  isFormSubmitted.value = true;
  // Clear any errors that may have occurred before the actual upload begins
  if (submissionError.value) {
    submissionError.value = "";
  }

  initiateUpload()
    .catch(() => {
      // Mark any files that don't have an UPLOADED status as FAILED
      dataProductFiles.value.forEach((f) => {
        if (f.uploadStatus !== STATUS.UPLOADED) {
          f.uploadStatus = STATUS.FAILED;
        }
      });

      submissionError.value =
        "An error was encountered. Please try submitting again.";
      // Set submission state to pristine, since no submission has taken place yet
      isFormSubmitted.value = false;
    })
    .finally(() => {
      const someUploadsFailed = failedFiles.value.length > 0;
      if (!someUploadsFailed) {
        initiateUploadedChunksMerge();
      }

      // If a log has been created for this Data Product upload
      if (submittedDataset.value) {
        datasetService
          .updateDataProductUploadLog(
            submittedDataset.value.dataset_upload.id,
            {
              status: someUploadsFailed
                ? config.upload_status.UPLOAD_FAILED
                : config.upload_status.UPLOADED,
              increment_processing_count: false,
            },
          )
          .then((res) => {
            submissionStatus.value = res.data.status;
          });
      }
    });
};

const initiateUpload = () => {
  // debugger;
  return evaluateChecksums()
    .then(() => {
      return {
        ...formData.value,
        files_metadata: dataProductFiles.value.map((e) => {
          return {
            file_name: e.name,
            file_checksum: e.fileChecksum,
            num_chunks: e.numChunks,
          };
        }),
      };
    })
    .then((data) => {
      return createOrUpdateUploadLog(data);
    })
    .then(async (status) => {
      submissionStatus.value = status;

      await uploadFiles(
        failedFiles.value.length > 0
          ? failedFiles.value
          : dataProductFiles.value,
      );
      someUploadsFailed.value = failedFiles.value.length > 0;
      if (someUploadsFailed.value) {
        form_status.value = STATUS.FAILED;
      }
      return someUploadsFailed.value;
    });
};

// Log (or update) upload status
const createOrUpdateUploadLog = (data) => {
  return failedFiles.value.length === 0
    ? datasetService.logDataProductUpload(data).then((res) => {
        submittedDataset.value = res.data;
        return submittedDataset.value.dataset_upload.status;
      })
    : datasetService
        .updateDataProductUploadLog(submittedDataset.value.dataset_upload.id, {
          status: config.upload_status.UPLOADING,
          increment_processing_count: false,
        })
        .then((res) => {
          return res.data.status;
        });
};

const initiateUploadedChunksMerge = () => {
  datasetService.createDatasetFiles(submittedDataset.value.dataset_upload.id);
};

const uploadFiles = async (files) => {
  form_status.value = STATUS.UPLOADING;

  for (let f = 0; f < files.length; f++) {
    let fileDetails = files[f];
    await uploadFile(fileDetails);

    if (f < files.length - 1) {
      console.log(`Proceeding to next file`);
    }
  }

  if (form_status.value !== STATUS.FAILED) {
    form_status.value = STATUS.UPLOADED;
  }
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
    // debugger;
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
          const matchingDataProducts = res.data.datasets;
          const matchingDataProductFound = matchingDataProducts.length !== 0;
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
  datasetService.getDataFileTypes().then((res) => {
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
  datasetService.getAll({ type: "RAW_DATA" }).then((res) => {
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

  .raw_data_select .va-select-content__autocomplete {
    padding-top: 7.5px;
    padding-bottom: 7.5px;
  }
}
</style>
