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
        <div class="text-xl">
          <!-- The explicit check for ` === true` is because Vuestic likely hides the boolean value behind
                     a proxy which evaluates to a truthy value. -->
          <i-mdi-check-circle
            v-if="value === true"
            style="color: var(--va-success)"
            class="m-auto"
          />
          <i-mdi-alert v-else style="color: var(--va-warning)" class="m-auto" />
        </div>
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
        <div v-if="rowData.check === 'num_files_same'">
          <num-files-diff
            class="pl-7"
            :original_files_count="rowData.details.original_files_count"
            :duplicate_files_count="rowData.details.duplicate_files_count"
          />
        </div>

        <div v-if="rowData.check === 'checksums_validated'">
          <va-scroll-container class="pl-7 max-h-52" vertical>
            <checksum-diff-table
              :items="rowData.details.conflicting_checksum_files"
            />
          </va-scroll-container>
        </div>
      </template>

      <!--      <template> </template>-->
    </va-data-table>
  </div>
</template>

<script setup>
import ChecksumDiffTable from "@/pages/ingestionManager/actionItem/ChecksumDiffTable.vue";
import NumFilesDiff from "@/pages/ingestionManager/actionItem/NumFilesDiff.vue";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const columns = ref([
  {
    key: "check",
    label: "Check",
  },
  { key: "passed", thAlign: "center", tdAlign: "center" },
  { key: "actions", thAlign: "right", tdAlign: "right" },
]);
</script>

<style scoped></style>
