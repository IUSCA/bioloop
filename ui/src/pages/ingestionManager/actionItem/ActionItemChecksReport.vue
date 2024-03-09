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
        <!--        <div class="flex gap-2">-->
        <!--          <VaAvatar :src="`https://randomuser.me/api/portraits/men/1.jpg`" />-->
        <!--          <div class="pl-2">-->
        <!--            <div class="flex gap-1">-->
        <!--              <span>test</span>-->
        <!--              <span class="va-link">test</span>-->
        <!--            </div>-->
        <!--            <div class="flex items-center">-->
        <!--              <VaIcon-->
        <!--                size="small"-->
        <!--                name="phone"-->
        <!--                color="secondary"-->
        <!--                class="mr-2"-->
        <!--              />-->
        <!--              <span>test</span>-->
        <!--            </div>-->
        <!--            <div class="flex items-center">-->
        <!--              <VaIcon-->
        <!--                size="small"-->
        <!--                name="email"-->
        <!--                color="secondary"-->
        <!--                class="mr-2"-->
        <!--              />-->
        <!--              <span>test</span>-->
        <!--            </div>-->
        <!--            <div class="flex items-center">-->
        <!--              <VaIcon-->
        <!--                size="small"-->
        <!--                name="language"-->
        <!--                color="secondary"-->
        <!--                class="mr-2"-->
        <!--              />-->
        <!--              <span class="va-link">test</span>-->
        <!--            </div>-->
        <!--          </div>-->
        <!--        </div>-->

        <div class="pl-7">
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
