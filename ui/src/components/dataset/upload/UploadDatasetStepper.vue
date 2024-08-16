<template>
  <va-inner-loading :loading="loading">
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
          <button
            class="step-button p-1 sm:p-3 cursor-pointer"
            :class="{
              'step-button--active': isActive,
              'step-button--completed': isCompleted,
            }"
            @click="setStep(i)"
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
  </va-inner-loading>
</template>

<script setup>
import datasetService from "@/services/dataset";
import _ from "lodash";
import SparkMD5 from "spark-md5";
// import uploadService from "@/services/upload";
import DatasetFileUploadTable from "@/components/dataset/upload/DatasetFileUploadTable.vue";
import config from "@/config";
import toast from "@/services/toast";
import UploadService from "@/services/upload";
import { formatBytes } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";
import { useBreakpoint, useForm } from "vuestic-ui";

const auth = useAuthStore();

// const { uploadToken } = storeToRefs(auth);
const uploadToken = ref(useLocalStorage("uploadToken", ""));

const breakpoint = useBreakpoint();

const { SUBMISSION_STATES } = config;

const { errorMessages, isDirty } = useForm("datasetUploadForm");

const RETRY_COUNT_THRESHOLD = 1;
const CHUNK_SIZE = 2 * 1024 * 1024; // Size of each chunk, set to 2 Mb
// Blob.slice method is used to segment files.
// At the same time, this method is used in different browsers in different
// ways.
const blobSlice =
  File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;

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

let uploadService = null;
const loading = ref(true);
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
const uploadCancelled = ref(false);

const filesNotUploaded = computed(() => {
  return dataProductFiles.value.filter(
    (e) => e.uploadStatus !== config.upload_status.UPLOADED,
  );
});
const someFilesPendingUpload = computed(
  () => filesNotUploaded.value.length > 0,
);
const isLastStep = computed(() => {
  return step.value === steps.length - 1;
});
const uploadFormData = computed(() => {
  return {
    data_product_name: datasetName.value,
    source_dataset_id: rawDataSelected.value[0].id,
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
const noFilesSelected = computed(() => {
  return dataProductFiles.value.length === 0;
});

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

onMounted(() => {
  loading.value = true;
  Promise.all([
    datasetService.getDatasetFileTypes(),
    datasetService.getAll({ type: "RAW_DATA" }),
  ])
    .then(([res1, res2]) => {
      fileTypeList.value = res1.data;
      rawDataList.value = res2.data.datasets;
    })
    .catch((err) => {
      toast.error("Failed to load resources");
      console.log(err);
    })
    .finally(() => {
      loading.value = false;
    });
});

const evaluateFileChecksums = (file) => {
  return new Promise((resolve, reject) => {
    console.log(`evaluating checksums for file ${file.name}`);

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
      console.error(err);
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

// Uploads a chunk. Retries to upload chunk upto 5 times in case of network
// errors.
const uploadChunk = async (chunkData) => {
  console.log("uploadChunk()");
  const upload = async () => {
    console.log("upload()");
    if (uploadCancelled.value) {
      return false;
    }

    let chunkUploaded = false;

    // console.log("uploadToken.value")
    // console.dir(uploadToken.value, {depth: null})

    uploadService.setToken(uploadToken.value);
    try {
      await uploadService.uploadFile(chunkData);
      chunkUploaded = true;
    } catch (e) {
      console.log(`Encountered error`, e);
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
    if (retry_count > RETRY_COUNT_THRESHOLD) {
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
    // If the request's body needs to be accessed before the request's file,
    // the body's fields should be set before the `file` field.
    chunkData.append("checksum", fileDetails.fileChecksum);
    chunkData.append("name", fileDetails.name);
    chunkData.append("total", blockCount);
    chunkData.append("index", i);
    chunkData.append("size", file.size);
    chunkData.append("data_product_name", datasetName.value);
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
  // console.log(`Beginning upload of file`);
  // console.log("fileDetails");
  console.dir(fileDetails, { depth: null });

  // persist token in store
  await auth.onFileUpload(fileDetails.name);

  // console.log("stepper token");
  // console.log(uploadToken.value);
  uploadService = new UploadService();

  // await testCall();

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

  auth.postFileUpload();
  return successful;
};

const onSubmit = () => {
  submissionStatus.value = SUBMISSION_STATES.PROCESSING;
  statusChipColor.value = "primary";
  submissionAlert.value = null; // reset any alerts from previous submissions
  isSubmissionAlertVisible.value = false;
  submitAttempted.value = true;

  // console.log("onSubmit will return");

  return new Promise((resolve, reject) => {
    preUpload()
      .then(async () => {
        submissionStatus.value = SUBMISSION_STATES.UPLOADING;

        const filesUploaded = await uploadFiles(filesNotUploaded.value);
        if (filesUploaded) {
          // console.log("if (filesUpload), resolve")
          resolve();
        } else {
          submissionStatus.value = SUBMISSION_STATES.UPLOAD_FAILED;
          statusChipColor.value = "warning";
          submissionAlertColor.value = "warning";
          submissionAlert.value = "Some files could not be uploaded.";
          isSubmissionAlertVisible.value = true;
          // console.log("else, reject")
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
        // console.log("catch")
        // console.log("reject")
        reject();
      });
  });
};

const postSubmit = () => {
  if (!someFilesPendingUpload.value) {
    submissionStatus.value = SUBMISSION_STATES.UPLOADED;
    statusChipColor.value = "primary";
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
      // console.log("onSubmit then");
      return datasetService.processUpload(uploadLog.value.dataset_id);
    })
    .catch((err) => {
      // console.log("onSubmit catch");
      console.log(err);
    })
    .finally(() => {
      postSubmit();
    });
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
      // if (isFormValid()) {
      handleSubmit();
      // }
    }
  } else {
    nextStep();
  }
};

// Evaluates selected file checksums, logs the upload
const preUpload = async () => {
  await evaluateChecksums(filesNotUploaded.value);

  const logData = uploadLog.value?.id
    ? {
        status: config.upload_status.UPLOADING,
        increment_processing_count: false,
      }
    : {
        ...uploadFormData.value,
        files_metadata: dataProductFiles.value.map((e) => {
          return {
            name: e.name,
            checksum: e.fileChecksum,
            num_chunks: e.numChunks,
          };
        }),
      };

  const res = await createOrUpdateUploadLog(uploadLog.value?.id, logData);
  uploadLog.value = res.data;
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
