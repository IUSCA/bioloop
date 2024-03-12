<template>
  <va-alert v-if="props.conflictingFiles.length === 0" color="success">
    All files in the original dataset match checksums of corresponding files in
    the incoming duplicate
  </va-alert>

  <div v-else>
    <va-alert color="warning">
      The following files in the original dataset did not match checksums of
      corresponding files in the incoming duplicate
    </va-alert>

    <va-scroll-container class="max-h-52" vertical>
      <va-card>
        <va-card-content>
          <va-data-table :columns="columns" :items="props.conflictingFiles">
            <template #cell(name)="{ value }">
              <div class="flex items-center gap-1">
                <FileTypeIcon :filename="value" />
                <span>{{ value }}</span>
              </div>
            </template>
          </va-data-table>
        </va-card-content>
      </va-card>
    </va-scroll-container>
  </div>
</template>

<script setup>
const props = defineProps({
  conflictingFiles: {
    type: Array,
    default: () => [],
  },
});

const columns = [
  {
    key: "name",
    label: "File",
    // width: "90px",
    // tdStyle: "word-wrap: break-word; overflow-wrap: anywhere;",
    // tdClass: "break-words",
  },
  {
    key: "path",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "original_md5",
    label: "Original File Checksum",
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "duplicate_md5",
    label: "Incoming Duplicate Checksum",
    thAlign: "right",
    tdAlign: "right",
  },
];
</script>

<style scoped></style>
