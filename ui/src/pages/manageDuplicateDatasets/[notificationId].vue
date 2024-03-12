<template>
  <va-inner-loading :loading="loading">
    <va-data-table :columns="columns" :items="notification.checks">
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

      <!-- Expanded details for current report -->
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
  </va-inner-loading>
</template>

<script setup>
import datasetService from "@/services/dataset";
import toast from "@/services/toast";

const props = defineProps({
  notificationId: {
    type: String,
    required: true,
  },
});

const loading = ref(false);
const notification = ref();

const fetchNotificationDetails = (notificationId) => {
  loading.value = true;
  return datasetService
    .getNotification(notificationId)
    .then((res) => {
      notification.value = res.data;
    })
    .catch((err) => {
      toast.error("Failed to fetch ingestion report");
      toast.error(err);
    })
    .finally(() => {
      loading.value = false;
    });
};

onMounted(() => {
  fetchNotificationDetails(props.notificationId);
});

const styleStatusChip = (passed) => {
  return passed === "true" ? "success" : "warning";
};
</script>

<style scoped></style>
