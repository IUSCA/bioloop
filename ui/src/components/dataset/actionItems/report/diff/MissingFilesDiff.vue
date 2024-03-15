<template>
  <va-alert v-if="props.missingFiles?.length === 0" color="success">
    {{ successAlertText }}
  </va-alert>

  <div v-else>
    <va-alert color="warning">
      {{ warningAlertText }}
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
  checkType: {
    type: String,
    required: true,
    validator: (value) => ['FILES_MISSING_FROM_ORIGINAL', 'FILES_MISSING_FROM_DUPLICATE'].includes(value)
  },
});

const _checkType = toRef(() => props.checkType)

const successAlertText = computed(() => {
  return _checkType.value === 'FILES_MISSING_FROM_ORIGINAL' ?
  'All files in the duplicate dataset were found in the original' :
  'All files in the original dataset were found in the duplicate'
})

const warningAlertText = computed(() => {
  return _checkType.value === 'FILES_MISSING_FROM_ORIGINAL' ?
  'The following files in the incoming duplicate dataset were not found in the original dataset' :
  'The following files in the original dataset were not found in the incoming duplicate dataset'            
})

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
