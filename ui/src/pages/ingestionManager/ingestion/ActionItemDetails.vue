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
            <va-list>
              <va-list-label>Files with differing checksums</va-list-label>

              <va-list-item
                v-for="(file, index) in rowData.details
                  .conflicting_checksum_files"
                :key="index"
              >
                <va-list-item-section icon>
                  <!--                  <va-avatar>-->
                  <!--                      class="text-xl flex-none text-gray-700"-->
                  <!--                    <Icon icon="mdi-folder" />-->
                  <!--                  <button class="flex items-center gap-1">-->
                  <!--                      <FileTypeIcon />-->
                  <Icon
                    icon="mdi-file"
                    class="text-2xl flex-none text-blue-600"
                  ></Icon>
                  <!--                  </button>-->
                  <!--                  </va-avatar>-->
                </va-list-item-section>

                <va-list-item-section>
                  <va-list-item-label>
                    {{ file.name }}
                  </va-list-item-label>

                  <va-list-item-label caption :lines="10">
                    Original checksum: {{ file.original_md5 }}
                    <br />
                    Incoming checksum: {{ file.duplicate_md5 }}
                  </va-list-item-label>
                </va-list-item-section>
              </va-list-item>
            </va-list>
          </va-scroll-container>
          <!--          <div class="flex flex-col">-->
          <!--            <div-->
          <!--              :key="index"-->
          <!--              v-for="(conflictingFile, index) in rowData.details-->
          <!--                .conflicting_checksum_files"-->
          <!--            >-->
          <!--              {{ conflictingFile.name }}-->
          <!--            </div>-->
          <!--          </div>-->
          <!--        </div>-->

          <!--        <div v-if="rowData.check === 'all_original_files_found'">-->
        </div>
        <!--                            {{ actionItemDetails(rowData) }}-->
      </template>
    </va-data-table>
  </div>
</template>

<script setup>
const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const columns = ref([
  {
    key: "label",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;",
  },
  { key: "passed", thAlign: "center", tdAlign: "center" },
  { key: "actions", thAlign: "center", tdAlign: "center" },
]);
</script>

<style scoped></style>
