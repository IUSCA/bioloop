<template>
  <!--
   Displays a report for each check performed in the process of determining
   whether two datasets are the same.

   The following checks are performed in the current process:
   1. Comparing number of files in both datasets
   2. Comparing checksums of files in both datasets
   3. Verifying if any files from the original dataset are missing from the incoming duplicate.
   4. Verifying if any files from the incoming duplicate dataset are missing from the original.
  -->
  <div class="flex flex-col gap-3">
    <va-alert v-if="!isDuplicateReadyForProcessing" color="warning" class="mx-0">
      Duplicate dataset needs to reach a state of DUPLICATE_READY before it can
      be accepted or rejected. Current state is {{ associatedDatasetState }}.
    </va-alert>

    <report-header :action-item="props.actionItem" />

    <report-body :action-item="props.actionItem" />

    <!-- Accept / Reject buttons -->
    <div class="flex gap-2 mt-5">
      <va-button
        @click="
          datasetService.accept_duplicate_dataset({
            duplicate_dataset_id: props.actionItem.dataset_id,
          })
        "
        :disabled="!isDuplicateReadyForProcessing"
        >Accept Duplicate</va-button
      >

      <va-button
        @click="
          datasetService.reject_duplicate_dataset({
            duplicate_dataset_id: props.actionItem.dataset_id,
          })
        "
        :disabled="!isDuplicateReadyForProcessing"
        >Reject Duplicate</va-button
      >
    </div>
  </div>
</template>

<script setup>
import ReportBody from "@/components/dataset/actionItems/datasetDiffReport/ReportBody.vue";
import datasetService from "@/services/dataset";

const props = defineProps({
  actionItem: {
    type: Object,
    required: true,
  },
});

// the current state of the dataset associated with this action item
const associatedDatasetState = computed(() => {
  // assumes states are sorted by descending timestamp
  const latestState = props.actionItem.dataset.states[0];
  return latestState.state;
});

const isDuplicateReadyForProcessing = computed(() => {
  return associatedDatasetState.value === "DUPLICATE_READY";
});
</script>
