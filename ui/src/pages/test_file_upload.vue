<script setup>
import SparkMD5 from "spark-md5";
import _ from "lodash";
import datasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";

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

const status = ref();
const inProgress = computed(() => status.value === STATUS.IN_PROGRESS);
const areControlsDisabled = computed(
  () => status.value === STATUS.IN_PROGRESS || status.value === STATUS.COMPLETE,
);
const dataProductFiles = ref([]);

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

onMounted(() => {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
  window.addEventListener("beforeunload", (e) => {
    if (inProgress.value) {
      // show warning before user leaves page
      e.returnValue = true;
    }
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

const removeFile = (index) => {
  dataProductFiles.value.splice(index, 1);
};
</script>

<template>
  <va-form tag="form" @submit.prevent="uploadFiles">
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
          <va-popover v-if="value === FILE_STATUS.PROCESSING" message="Pending">
            <va-icon name="pending" color="info" />
          </va-popover>
          <va-popover v-if="value === FILE_STATUS.FAILED" message="Failed">
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
    <va-button type="submit">Upload</va-button>
  </va-form>
</template>

<style scoped></style>
