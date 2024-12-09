<template>
  <va-inner-loading :loading="loading">
    <va-card>
      <va-card-title class="mt-1">
        <span class="text-lg">Duplication Analysis Report</span>
      </va-card-title>

      <va-card-content>
        <!-- Table for various checks performed as part of ingesting a dataset -->
        <va-data-table
          :columns="columns"
          :items="props.ingestionChecks"
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
              <va-inner-loading :loading="loading">
                <checksums-diff
                  v-if="rowData.type === 'CHECKSUMS_MATCH'"
                  :conflicting-files="rowData.file_checks.map(check => check.file)"
                  :original-dataset-files="originalDatasetFiles"
                  :duplicate-dataset-files="duplicateDatasetFiles"
                />
              </va-inner-loading>

              <missing-files-diff
                v-if="
                  rowData.type === 'FILES_MISSING_FROM_ORIGINAL' ||
                  rowData.type === 'FILES_MISSING_FROM_DUPLICATE'
                "
                :missing-files="rowData.file_checks.map(check => check.file)"
                :check-type="rowData.type"
              >
              </missing-files-diff>

              <va-inner-loading :loading="loading">
                <number-of-files-diff
                  v-if="rowData.type === 'FILE_COUNT'"
                  :num-files-duplicate-dataset="originalDatasetFiles?.length"
                  :num-files-original-dataset="duplicateDatasetFiles?.length"
                />
              </va-inner-loading>
            </div>
          </template>
        </va-data-table>
      </va-card-content>
    </va-card>
  </va-inner-loading>
</template>

<script setup>
import NumberOfFilesDiff from "@/components/dataset/actionItems/duplication/report/diff/NumberOfFilesDiff.vue";
import datasetService from "@/services/dataset";
import toast from "@/services/toast";

const props = defineProps({
  ingestionChecks: {
    type: Array,
    required: true,
  },
  originalDataset: {
    type: Object,
    required: true,
  },
  duplicateDataset: {
    type: Object,
    required: true,
  }
});

console.log('ReportBody props.ingestionChecks');
console.log(props.ingestionChecks);

const loading = ref(false);
const originalDatasetFiles = ref([]);
const duplicateDatasetFiles = ref([]);

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

onMounted(() => {
  loading.value = true;
  if (props.originalDataset && props.duplicateDataset) {
    Promise.all(
      [
        datasetService.filter_files({id: props.originalDataset.id, file_type: "file"}),
        datasetService.filter_files({id: props.duplicateDataset.id, file_type: "file"})
      ]).then(([res1, res2]) => {
        originalDatasetFiles.value = res1.data;
        duplicateDatasetFiles.value = res2.data;
      }).catch(err => {
        toast.error("Failed to fetch resources")
        console.error(err);
      }).finally(() => {
        loading.value = false;
      })
    }
})
</script>
