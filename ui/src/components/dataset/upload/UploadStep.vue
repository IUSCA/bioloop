<script setup>

import SelectFileButtons from "@/components/dataset/upload/SelectFileButtons.vue";
</script>

<template>
        <div class="flex flex-col">
          <SelectFileButtons
            :disabled="submitAttempted || loading || validatingForm"
            @files-added="
              (files) => {
                clearSelectedDirectoryToUpload();
                setFiles(files);
                isSubmissionAlertVisible = false;
                setUploadedFileType(FILE_TYPE.FILE);
              }
            "
            @directory-added="
              (directoryDetails) => {
                clearSelectedFilesToUpload();
                datasetToUploadInputName = '';
                setDirectory(directoryDetails);
                isSubmissionAlertVisible = false;
                setUploadedFileType(FILE_TYPE.DIRECTORY);
              }
            "
          />

          <va-divider />

          <div
            class="flex flex-row"
            v-if="selectingFiles || selectingDirectory"
          >
            <div class="flex-1">
              <va-card class="upload-details">
                <va-card-title>
                  <div class="flex flex-nowrap items-center w-full">
                    <span class="text-lg">Details</span>
                  </div>
                </va-card-title>
                <va-card-content>
                  <UploadedDatasetDetails
                    v-if="selectingFiles || selectingDirectory"
                    :dataset="datasetUploadLog?.dataset"
                    :dataset-name="selectedDirectoryName"
                    v-model:dataset-name-input="datasetToUploadInputName"
                    :input-disabled="submitAttempted"
                    :selecting-files="selectingFiles"
                    :selecting-directory="selectingDirectory"
                    :uploaded-data-product-error-messages="
                      formErrors[FIELDS.UPLOAD]
                    "
                    :uploaded-data-product-error="
                      !!formErrors[FIELDS.UPLOAD]
                    "
                    :source-raw-data="rawDataSelected"
                    :submission-status="submissionStatus"
                    :submission-alert="submissionAlert"
                    :status-chip-color="statusChipColor"
                    :submission-alert-color="submissionAlertColor"
                    :is-submission-alert-visible="isSubmissionAlertVisible"
                  /> </va-card-content
              ></va-card>
            </div>

            <va-divider vertical />

            <div class="flex-1">
              <DatasetFileUploadTable
                :source-raw-data="
                  rawDataSelected.length > 0 ? rawDataSelected[0] : null
                "
                @file-removed="removeFile"
                :submit-attempted="submitAttempted"
                :files="displayedFilesToUpload"
                :selecting-files="selectingFiles"
                :selecting-directory="selectingDirectory"
              />
            </div>
          </div>
        </div>
</template>

<style scoped>

</style>