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
        >Accept Incoming</va-button
      >

      <va-button
        @click="
          datasetService.reject_duplicate_dataset({
            duplicate_dataset_id: props.actionItem.dataset_id,
          })
        "
        >Reject Incoming</va-button
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
</script>
