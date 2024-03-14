<template>
  <va-alert v-if="props.missingFiles?.length === 0" color="success">
    All files in the original dataset were found in the incoming duplicate
  </va-alert>

  <div v-else>
    <va-alert color="warning">
      {{ props.alertLabel }}
    </va-alert>

    <va-scroll-container class="max-h-52" vertical>
      <!--      <va-card>-->
      <!--        <va-card-content>-->
      <va-data-table :columns="columns" :items="props.missingFiles">
        <template #cell(name)="{ value }">
          <div class="flex items-center gap-1">
            <FileTypeIcon :filename="value" />
            <span>{{ value }}</span>
          </div>
        </template>
      </va-data-table>
      <!--        </va-card-content>-->
      <!--      </va-card>-->
    </va-scroll-container>
  </div>
</template>

<script setup>
const props = defineProps({
  missingFiles: {
    type: Array,
  },
  alertLabel: {
    type: String,
    required: true
  } 
});

const columns = [
  {
    key: "name",
    label: "File",
  },
  {
    key: "path",
    thAlign: "right",
    tdAlign: "right",
  },
];
</script>

<style scoped></style>
