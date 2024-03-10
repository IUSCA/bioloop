<template>
  <!--
   Displays a report for each check performed in the process of determining
   whether two datasets are the same.

   The following checks are performed in the current process:
   1. Comparing number of files in both datasets
   2. Comparing checksums of files in both datasets
   3. Verifying if each file from the original dataset is present in the duplicate.
  -->
  <div>
    <va-data-table :columns="columns" :items="props.item.metadata.checks">
      <template #cell(check)="{ rowData }">
        {{ rowData.label }}
      </template>

      <!-- The current check's passed / failed status -->
      <template #cell(passed)="{ value }">
        <va-chip size="small" :color="styleStatusChip(value)">
          {{ value === "true" ? "PASSED" : "FAILED" }}
        </va-chip>
      </template>

      <!-- Actions -->
      <template #cell(actions)="{ row, isExpanded }">
        <va-button
          @click="row.toggleRowDetails()"
          :icon="isExpanded ? 'va-arrow-up' : 'va-arrow-down'"
          preset="plain"
        >
          {{ isExpanded ? "Hide" : "More info" }}
        </va-button>
      </template>

      <!-- Expanded details for current action item -->
      <template #expandableRow="{ rowData }">
        <div class="px-7">
          <num-files-diff
            v-if="rowData.check === 'num_files_same'"
            :original_files_count="rowData.details.original_files_count"
            :duplicate_files_count="rowData.details.duplicate_files_count"
          />

          <checksums-diff
            v-if="rowData.check === 'checksums_validated'"
            :conflicting-files="rowData.details.conflicting_checksum_files"
          />

          <files-diff
            v-if="rowData.check === 'all_original_files_found'"
            :missing-files="rowData.details.missing_files"
          >
          </files-diff>
        </div>
      </template>

      <!--      <template> </template>-->
    </va-data-table>
  </div>
</template>

<script setup>
import NumFilesDiff from "@/pages/ingestionManager/actionItem/NumFilesDiff.vue";
import FilesDiff from "@/pages/ingestionManager/actionItem/FilesDiff.vue";
import ChecksumsDiff from "@/pages/ingestionManager/actionItem/ChecksumsDiff.vue";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const styleStatusChip = (passed) => {
  return passed === "true" ? "success" : "warning";
};

const columns = ref([
  {
    key: "check",
    label: "Check",
  },
  { key: "passed", label: "Status", thAlign: "center", tdAlign: "center" },
  { key: "actions", thAlign: "right", tdAlign: "right" },
]);
</script>

<style scoped></style>
