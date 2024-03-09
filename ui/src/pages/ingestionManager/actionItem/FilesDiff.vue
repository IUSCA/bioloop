<template>
  <va-alert v-if="props.missingFiles?.length === 0" color="success">
    All files in the original dataset were found in the incoming duplicate
  </va-alert>

  <div v-else>
    <va-alert color="warning">
      The following files in the original dataset were not found in the incoming
      duplicate
    </va-alert>

    <va-scroll-container class="max-h-52" vertical>
      <va-data-table :columns="columns" :items="props.missingFiles">
        <template #cell(name)="{ value }">
          <div class="flex items-center gap-1">
            <FileTypeIcon :filename="value" />
            <span>{{ value }}</span>
          </div>
        </template>
      </va-data-table>
    </va-scroll-container>
  </div>
</template>

<script setup>
const props = defineProps({
  missingFiles: {
    type: Array,
  },
});

const columns = [
  {
    key: "name",
    label: "File",
  },
  {
    key: "path",
    thAlign: "center",
    tdAlign: "center",
  },
];
</script>

<style scoped></style>
