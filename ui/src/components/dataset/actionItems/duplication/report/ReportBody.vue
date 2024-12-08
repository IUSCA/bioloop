<template>
  <va-card>
    <va-card-title class="mt-1">
      <span class="text-lg">Duplication Analysis Report</span>
    </va-card-title>

    <va-card-content>
      <!-- Table for various checks performed as part of ingesting a dataset -->
      <va-data-table
        :columns="columns"
        :items="props.actionItem.ingestion_checks"
      >
        <template #cell(check)="{ rowData }">
          {{ rowData.label }}
        </template>

        <!-- The current check's passed / failed status -->
        <template #cell(passed)="{ value }">
          <div>
            <i-mdi-check-circle-outline
              v-if="value === 'true'"
              class="text-green-700"
            />
            <i-mdi-close-circle-outline
              v-if="value === 'false'"
              class="text-red-700"
            />
          </div>
        </template>

        <!-- Expand current check's row -->
        <template #cell(actions)="{ row, isExpanded }">
          <va-button
            @click="row.toggleRowDetails()"
            :icon="isExpanded ? 'va-arrow-up' : 'va-arrow-down'"
            preset="plain"
          >
            {{ isExpanded ? "Hide" : "More info" }}
          </va-button>
        </template>

        <!-- Expanded details for current check -->
        <template #expandableRow="{ rowData }">
          <div>
            <checksums-diff
              v-if="rowData.type === 'CHECKSUMS_MATCH'"
              :conflicting-files="rowData.file_checks.map(check => check.file)"
            />

            <missing-files-diff
              v-if="
                rowData.type === 'FILES_MISSING_FROM_ORIGINAL' ||
                rowData.type === 'FILES_MISSING_FROM_DUPLICATE'
              "
              :missing-files="rowData.file_checks.map(check => check.file)"
              :check-type="rowData.type"
            >
            </missing-files-diff>

            <number-of-files-diff
              v-if="rowData.type === 'FILE_COUNT'"
              :num-files-duplicate-dataset="
                rowData.report.num_files_duplicate_dataset
              "
              :num-files-original-dataset="
                rowData.report.num_files_original_dataset
              "
            />
          </div>
        </template>
      </va-data-table>
    </va-card-content>
  </va-card>
</template>

<script setup>
import NumberOfFilesDiff from "@/components/dataset/actionItems/duplication/report/diff/NumberOfFilesDiff.vue";

const props = defineProps({
  actionItem: {
    type: Object,
    required: true,
  },
});

const columns = ref([
  {
    key: "check",
    label: "Check",
  },
  {
    key: "passed",
    label: "Status",
    thAlign: "left",
    tdAlign: "right",
  },
  { key: "actions", thAlign: "right", tdAlign: "right" },
]);
</script>
