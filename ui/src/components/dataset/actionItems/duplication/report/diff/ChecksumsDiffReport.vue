<template>
  <va-alert
    v-if="props.passed === null || props.passed === undefined"
    color="info"
    icon="info"
  >
    These datasets do not have any files in common
  </va-alert>

  <va-alert v-else-if="props.passed" color="success" icon="success">
    All files in the original dataset match checksums of corresponding files in
    the incoming duplicate
  </va-alert>

  <div v-else>
    <div>
      <va-alert class="mb-4" color="warning" icon="warning">
        The following files in the original dataset did not match checksums of
        corresponding files in the incoming duplicate
      </va-alert>
      <ChecksumsDiff
        :conflicting-files="props.conflictingFiles"
        :original-dataset-files="props.originalDatasetFiles"
        :duplicate-dataset-files="props.duplicateDatasetFiles"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  passed: {
    type: Array,
    default: () => [],
  },
  conflictingFiles: {
    type: Array,
    default: () => [],
  },
  originalDatasetFiles: {
    type: Array,
    default: () => [],
  },
  duplicateDatasetFiles: {
    type: Array,
    default: () => [],
  },
});
</script>
