<template>
  <va-card class="mt-5">
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
              <td>Data Product</td>
              <td>
                <UploadedDatasetName
                  v-model:uploaded-dataset-name="uploadedDirectoryName"
                  :selecting-files="props.selectingFiles"
                  :selecting-directory="props.selectingDirectory"
                  :error-messages="props.uploadedDataProductErrorMessages"
                  :error="props.uploadedDataProductError"
                />
              </td>
            </tr>

            <tr>
              <td>Status</td>
              <td>
                <va-chip size="small" :color="props.statusChipColor">
                  {{ props.submissionStatus }}
                </va-chip>
              </td>
            </tr>

            <tr v-if="props.sourceRawData">
              <td>Source Raw Data</td>
              <td>
                <span>
                  <router-link
                    :to="`/datasets/${props.sourceRawData?.id}`"
                    target="_blank"
                  >
                    {{ props.sourceRawData?.name }}
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

<script setup>
const props = defineProps({
  uploadedDirectoryName: {
    type: String,
    required: true,
  },
  selectingFiles: {
    type: Boolean,
    required: true,
  },
  selectingDirectory: {
    type: Boolean,
    required: true,
  },
  uploadedDataProductErrorMessages: {
    type: Array,
    required: true,
  },
  uploadedDataProductError: {
    type: Boolean,
    required: true,
  },
});

const uploadedDirectoryName = computed({
  get() {
    return props.uploadedDirectoryName;
  },
  set(value) {},
});
</script>

<style scoped></style>
