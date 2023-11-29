<template>
  <va-form ref="dataProductUploadForm" class="h-full">
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
          @click="isFormValid() && setStep(i)"
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

      <!-- File upload tool and selected files table -->
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
                isFileUploadAlertVisible = false;
              }
            "
            :disabled="submitAttempted"
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
              <va-progress-circle
                :model-value="value ? parseInt(value, 10) : 0"
                size="small"
              >
                {{ value && value + "%" }}
              </va-progress-circle>
            </template>

            <template #cell(uploadStatus)="{ value }">
              <span class="flex justify-center">
                <va-popover
                  v-if="value === config.upload_status.UPLOADED"
                  message="Succeeded"
                >
                  <va-icon name="check_circle_outline" color="success" />
                </va-popover>
                <va-popover
                  v-if="value === config.upload_status.UPLOADING"
                  message="Uploading"
                >
                  <va-icon name="pending" color="info" />
                </va-popover>
                <va-popover
                  v-if="value === config.upload_status.UPLOAD_FAILED"
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
                  :disabled="submitAttempted"
                />
              </div>
            </template>
          </va-data-table>
        </div>

        <va-alert
          v-if="isSubmissionAlertVisible"
          class="mt-5"
          :color="submissionAlertColor"
          border="left"
          dense
          >{{ submissionAlert }}
        </va-alert>

        <!-- Submitted values -->
        <va-card v-if="submitAttempted" class="mt-5">
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
                      <va-chip size="small" :color="statusChipColor">
                        {{ submissionStatus }}
                      </va-chip>
                    </td>
                  </tr>
                  <tr>
                    <td>Data Product Name</td>
                    <td>{{ dataProductName }}</td>
                  </tr>
                  <tr>
                    <td>File Type</td>
                    <td>
                      <va-chip outline small class="mr-2">{{
                        fileTypeSelected.name
                      }}</va-chip>
                      <va-chip outline small>{{
                        fileTypeSelected.extension
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
                isSubmissionAlertVisible = false;
                isFileUploadAlertVisible = false;
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
import { formatBytes } from "@/services/utils";
import { useForm } from "vuestic-ui";
import config from "@/config";

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
  { label: "Select Files", icon: "material-symbols:folder" },
];
const SUBMISSION_STATES = {
  UNINITIATED: "Uninitiated",
  PROCESSING: "Processing",
  PROCESSING_FAILED: "Processing Failed",
  UPLOADING: "Uploading",
  UPLOAD_FAILED: "Upload Failed",
  UPLOADED: "Uploaded",
};

const dataProductName = ref("");
const fileTypeSelected = ref();
const fileTypeList = ref([]);
const rawDataSelected = ref();
const rawDataSelected_search = ref("");
const uploadLog = ref();
const submissionStatus = ref(SUBMISSION_STATES.UNINITIATED);
const statusChipColor = ref();
const submissionAlert = ref(); // For handling network errors before upload begins
const submissionAlertColor = ref();
const isSubmissionAlertVisible = ref(false);
const submitAttempted = ref(false);
const dataProductFiles = ref([]);
const filesNotUploaded = computed(() => {
  return dataProductFiles.value.filter(
    (e) => e.uploadStatus !== config.upload_status.UPLOADED,
  );
});
const someFilesPendingUpload = computed(
  () => filesNotUploaded.value.length > 0,
);
const rawDataList = ref([]);
const step = ref(0);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});
const isFileUploadAlertVisible = ref(false);
const noFilesSelected = computed(() => {
  return dataProductFiles.value.length === 0;
});
const uploadCancelled = ref(false);

const { isValid, validate } = useForm("dataProductUploadForm");

const isFormValid = () => {
  validate();
  return isValid.value;
};

// Returns the file's and individual chunks' checksums
const evaluateFileChecksums = (file) => {
  return new Promise((resolve, reject) => {
    console.warn(`evaluating checksums for file ${file.name}`);

    const fileReader = new FileReader();

    function loadNext(currentChunkIndex) {
      const start = currentChunkIndex * CHUNK_SIZE;
      const end =
        start + CHUNK_SIZE >= file.size ? file.size : start + CHUNK_SIZE;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    try {
      let chunkIndex = 0;
      const chunks = Math.ceil(file.size / CHUNK_SIZE);
      const buffer = new SparkMD5.ArrayBuffer();
      const chunkChecksums = [];

      fileReader.onload = (e) => {
        const result = e.target.result;
        chunkChecksums.push(SparkMD5.ArrayBuffer.hash(result));

        buffer.append(result); // Append to array buffer
        chunkIndex += 1;
        if (chunkIndex < chunks) {
          // if (file.name === "150MB_file.zip" && chunkIndex === 35) {
          //   throw new Error("error 35!");
          // }
          loadNext(chunkIndex);
        } else {
          console.log(`successfully evaluated checksums of file ${file.name}`);
          resolve({
            fileChecksum: buffer.end(),
            chunkChecksums,
          });
        }
      };

      fileReader.onerror = () => {
        console.warn(`file reading failed for file ${file.name}`);
        reject(fileReader.error);
      };

      loadNext(chunkIndex);
    } catch (err) {
      console.warn(`checksum evaluation failed for file ${file.name}`);
      reject(err);
    }
  });
};

const evaluateChecksums = (filesToUpload) => {
  return new Promise((resolve, reject) => {
    const filePromises = [];
    for (let i = 0; i < filesToUpload.length; i++) {
      let fileDetails = filesToUpload[i];
      if (!fileDetails.checksumsEvaluated) {
        const file = fileDetails.file;
        fileDetails.numChunks = Math.ceil(file.size / CHUNK_SIZE); // total number of fragments

        filePromises.push(
          new Promise((resolve, reject) => {
            evaluateFileChecksums(file)
              .then(({ fileChecksum, chunkChecksums }) => {
                fileDetails.fileChecksum = fileChecksum;
                fileDetails.chunkChecksums = chunkChecksums;
                fileDetails.checksumsEvaluated = true;
                console.log(
                  `Successfully evaluated checksums of file ${file.name}`,
                );
                resolve();
              })
              .catch(() => {
                fileDetails.checksumsEvaluated = false;
                console.log(
                  `Failed to evaluate checksums of file ${file.name}`,
                );
                reject();
              });
          }),
        );
      }
    }

    Promise.all(filePromises)
      .then(() => {
        resolve();
      })
      .catch(() => {
        reject();
      });
  });
};

// Uploads a chunk. Retries to upload chunk upto 5 times in case of network errors.
const uploadChunk = async (chunkData) => {
  const upload = async () => {
    if (uploadCancelled.value) {
      return false;
    }

    let chunkUploaded = false;
    console.log(
      `Attempting to upload chunk ${chunkData.get(
        "index",
      )} of file ${chunkData.get("name")}`,
    );
    try {
      await datasetService.uploadFileChunk(chunkData);
      chunkUploaded = true;
      console.log(
        `Uploaded chunk ${chunkData.get("index")} of file ${chunkData.get(
          "name",
        )}`,
      );
    } catch (e) {
      console.log(`Encountered error`);
    }
    return chunkUploaded;
  };

  let retry_count = 0;
  let uploaded = false;
  while (!uploaded && !uploadCancelled.value) {
    uploaded = await upload();
    if (!uploaded) {
      retry_count += 1;
    }
    if (retry_count <= RETRY_COUNT_THRESHOLD) {
      console.log("Retrying");
    } else {
      console.log("Exceeded retry threshold");
      break;
    }
  }

  return uploaded;
};

const uploadFileChunks = async (fileDetails) => {
  let file = fileDetails.file;
  let uploaded = false;

  console.log(`Beginning upload of file ${file.name}`);
  const blockCount = fileDetails.numChunks;

  for (let i = 0; i < blockCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);

    const fileData = blobSlice.call(file, start, end);
    // Building form data
    const chunkData = new FormData();
    // If the request's body needs to be accessed before the request's file, the body's fields
    // should be set before the `file` field.
    chunkData.append("checksum", fileDetails.fileChecksum);
    chunkData.append("name", fileDetails.name);
    chunkData.append("total", blockCount);
    chunkData.append("index", i);
    chunkData.append("size", file.size);
    chunkData.append("data_product_name", dataProductName.value);
    chunkData.append("chunk_checksum", fileDetails.chunkChecksums[i]);
    chunkData.append("file", fileData);

    // Try uploading chunk, or retry until retry threshold is reached
    uploaded = await uploadChunk(chunkData);
    if (!uploaded) {
      break;
    } else {
      fileDetails.progress = Math.trunc(((i + 1) / blockCount) * 100);
    }
  }

  return uploaded;
};

const uploadFile = async (fileDetails) => {
  fileDetails.uploadStatus = config.upload_status.UPLOADING;
  const checksum = fileDetails.fileChecksum;
  const fileLogId = uploadLog.value.files.find((e) => e.md5 === checksum)?.id;

  const uploaded = await uploadFileChunks(fileDetails);
  if (uploaded) {
    console.log(`File ${fileDetails.name} was successfully uploaded`);
  } else {
    console.log(`Upload of file ${fileDetails.name} failed`);
  }

  fileDetails.uploadStatus = uploaded
    ? config.upload_status.UPLOADED
    : config.upload_status.UPLOAD_FAILED;

  let updated = false;
  if (uploaded) {
    try {
      await datasetService.updateFileUploadLog(fileLogId, {
        status: config.upload_status.UPLOADED,
      });
      updated = true;
    } catch (e) {
      console.log(e);
    }
  }

  const successful = uploaded && updated;
  if (!successful) {
    delete fileDetails.progress;
  }

  return successful;
};

const onSubmit = () => {
  submissionStatus.value = SUBMISSION_STATES.PROCESSING;
  statusChipColor.value = "primary";
  submissionAlert.value = null;
  isSubmissionAlertVisible.value = false;
  submitAttempted.value = true;

  return new Promise((resolve, reject) => {
    preUpload()
      .then(async () => {
        submissionStatus.value = SUBMISSION_STATES.UPLOADING;

        const filesUploaded = await uploadFiles(filesNotUploaded.value);
        if (filesUploaded) {
          resolve();
        } else {
          submissionStatus.value = SUBMISSION_STATES.UPLOAD_FAILED;
          statusChipColor.value = "warning";
          submissionAlertColor.value = "warning";
          submissionAlert.value = "Some files could not be uploaded.";
          isSubmissionAlertVisible.value = true;
          reject();
        }
      })
      .catch((err) => {
        console.log(err);
        submissionStatus.value = SUBMISSION_STATES.PROCESSING_FAILED;
        statusChipColor.value = "warning";
        submissionAlertColor.value = "warning";
        submissionAlert.value =
          "There was an error. Please try submitting again.";
        isSubmissionAlertVisible.value = true;
        reject();
      });
  });
};

const postSubmit = () => {
  if (!someFilesPendingUpload.value) {
    submissionStatus.value = SUBMISSION_STATES.UPLOADED;
    statusChipColor.value = "success";
    submissionAlertColor.value = "success";
    submissionAlert.value =
      "All files have been uploaded successfully. You may close this window.";
    isSubmissionAlertVisible.value = true;
  }

  const failedFileUpdates = filesNotUploaded.value.map((file) => {
    return {
      id: uploadLog.value.files.find((log) => log.md5 === file.fileChecksum).id,
      data: {
        status: config.upload_status.UPLOAD_FAILED,
      },
    };
  });

  if (uploadLog.value) {
    createOrUpdateUploadLog(uploadLog.value.id, {
      status: someFilesPendingUpload.value
        ? config.upload_status.UPLOAD_FAILED
        : config.upload_status.UPLOADED,
      increment_processing_count: false,
      files: failedFileUpdates,
    })
      .then((res) => {
        uploadLog.value = res.data;
      })
      .catch((err) => {
        console.log(err);
      });
  }
};

const handleSubmit = () => {
  onSubmit() // resolves once all files have been uploaded
    .then(() => {
      return datasetService.processUploadedChunks(uploadLog.value.dataset_id);
    })
    .catch((err) => {
      console.log(err);
    })
    .finally(() => {
      postSubmit();
    });
};

const onNextClick = (nextStep) => {
  if (isLastStep.value) {
    if (noFilesSelected.value) {
      isFileUploadAlertVisible.value = true;
    } else {
      if (isValid.value) {
        handleSubmit();
      }
    }
  } else {
    isFileUploadAlertVisible.value = false;
    nextStep();
  }
};

const formData = computed(() => {
  return {
    data_product_name: dataProductName.value,
    source_dataset_id: rawDataSelected.value.id,
    file_type: fileTypeSelected.value,
  };
});

const isSubmitEnabled = computed(() => {
  return (
    submissionStatus.value === SUBMISSION_STATES.UNINITIATED ||
    submissionStatus.value === SUBMISSION_STATES.PROCESSING_FAILED ||
    submissionStatus.value === SUBMISSION_STATES.UPLOAD_FAILED
  );
});

// Evaluates selected file checksums, logs the upload
const preUpload = () => {
  return evaluateChecksums(filesNotUploaded.value).then(() => {
    const data = uploadLog.value?.id
      ? {
          status: config.upload_status.UPLOADING,
          increment_processing_count: false,
        }
      : {
          ...formData.value,
          files_metadata: dataProductFiles.value.map((e) => {
            return {
              name: e.name,
              checksum: e.fileChecksum,
              num_chunks: e.numChunks,
            };
          }),
        };

    return createOrUpdateUploadLog(uploadLog.value?.id, data)
      .then((res) => {
        uploadLog.value = res.data;
        return Promise.resolve();
      })
      .catch(() => {
        return Promise.reject();
      });
  });
};

// Log (or update) upload status
const createOrUpdateUploadLog = (logId, data) => {
  return !logId
    ? datasetService.logUpload(data)
    : datasetService.updateUploadLog(logId, data);
};

const uploadFiles = async (files) => {
  let uploaded = false;
  for (let f = 0; f < files.length; f++) {
    let fileDetails = files[f];

    uploaded = await uploadFile(fileDetails);
    if (!uploaded) {
      break;
    }
  }

  return uploaded;
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

const validateNotExists = (value) => {
  return new Promise((resolve) => {
    // Vuestic claims that it should not run async validation if synchronous validation fails,
    // but it seems to be triggering async validation nonetheless when `value` is ''. Hence
    // the explicit check for whether `value` is falsy.
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

onMounted(() => {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
  window.addEventListener("beforeunload", (e) => {
    if (
      submitAttempted.value &&
      submissionStatus.value !== SUBMISSION_STATES.UPLOADED
    ) {
      // show warning before user leaves page
      e.returnValue = true;
    }
  });
});

// show warning before user moves to a different route
onBeforeRouteLeave(() => {
  return submitAttempted.value &&
    submissionStatus.value !== SUBMISSION_STATES.UPLOADED
    ? window.confirm(
        "Leaving this page before all files have been processed/uploaded will" +
          " cancel the upload. Do you wish to continue?",
      )
    : true;
});

onBeforeUnmount(() => {
  // Cancels pending uploads and prompts cleanup activities before page unload
  uploadCancelled.value = true;
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
