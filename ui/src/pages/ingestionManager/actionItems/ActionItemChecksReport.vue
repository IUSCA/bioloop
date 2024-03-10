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
    <va-data-table :columns="columns" :items="props.item.checks">
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
            v-if="rowData.type === 'FILE_COUNT'"
            :original_files_count="rowData.report.original_files_count"
            :duplicate_files_count="rowData.report.duplicate_files_count"
          />

          <checksums-diff
            v-if="rowData.type === 'CHECKSUMS_MATCH'"
            :conflicting-files="rowData.report.conflicting_checksum_files"
          />

          <files-diff
            v-if="rowData.type === 'NO_MISSING_FILES'"
            :missing-files="rowData.report.missing_files"
          >
          </files-diff>
        </div>
      </template>
    </va-data-table>
  </div>
</template>

<script setup>
import NumFilesDiff from "@/pages/ingestionManager/actionItems/NumFilesDiff.vue";
import FilesDiff from "@/pages/ingestionManager/actionItems/FilesDiff.vue";
import ChecksumsDiff from "@/pages/ingestionManager/actionItems/ChecksumsDiff.vue";

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
