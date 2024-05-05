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
          <va-chip outline size="small">
            {{ rowData.label }}
          </va-chip>
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
              :conflicting-files="rowData.report.conflicting_checksum_files"
            />

            <missing-files-diff
              v-if="
                rowData.type === 'FILES_MISSING_FROM_ORIGINAL' ||
                rowData.type === 'FILES_MISSING_FROM_DUPLICATE'
              "
              :missing-files="rowData.report.missing_files"
              :check-type="rowData.type"
            >
            </missing-files-diff>
          </div>
        </template>
      </va-data-table>
    </va-card-content>
  </va-card>
</template>

<script setup>
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
