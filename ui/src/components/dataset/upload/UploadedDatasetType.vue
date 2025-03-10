<template>
  <div>
    <h3>Select Dataset Type</h3>
    <va-select
      v-model="datasetType"
      :options="datasetTypeOptions"
      label="Dataset Type"
    />
  </div>
</template>

<script setup>
const props = defineProps({
  selectedDatasetType: {
    type: Object,
    required: true
  },
  datasetTypeOptions: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['update:selectedDatasetType']);

const datasetType = computed({
  get: () => props.selectedDatasetType,
  set: (newValue) => {
    emit('update:selectedDatasetType', newValue);
  }
});

const onDatasetTypeChange = (newType) => {
  emit('update:selectedDatasetType', newType);
};
</script>
