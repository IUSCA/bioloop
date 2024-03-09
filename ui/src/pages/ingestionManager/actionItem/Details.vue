<template>
  <div>
    <va-data-table :columns="columns" :items="props.item.metadata.checks">
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
          <div class="flex gap-2">
            <div>
              Number of files in original dataset:
              {{ rowData.details.original_files_count }}
            </div>
            <va-divider vertical></va-divider>
            <div>
              Number of files in incoming duplicate dataset:
              {{ rowData.details.duplicate_files_count }}
            </div>
          </div>
        </div>

        <div v-if="rowData.check === 'checksums_validated'">
          <va-scroll-container class="max-h-52" vertical>
            <checksum-diff-table
              :items="rowData.details.conflicting_checksum_files"
            />
          </va-scroll-container>
        </div>
      </template>
    </va-data-table>
  </div>
</template>

<script setup>
import ChecksumDiffTable from "@/pages/ingestionManager/actionItem/ChecksumDiffTable.vue";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const columns = ref([
  {
    key: "label",
    tdStyle: "word-wrap: break-word; overflow-wrap: anywhere;",
  },
  { key: "passed", thAlign: "center", tdAlign: "center" },
  { key: "actions", thAlign: "center", tdAlign: "center" },
]);
</script>

<style scoped></style>
