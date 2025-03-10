<template>
  <div>
    <h3>Select Source Raw Data</h3>
    <!-- Implement your raw data selection UI here -->
  </div>
</template>

<script setup>
const props = defineProps({
  rawDataSelected: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['update:rawDataSelected']);

const onRawDataSelect = (selectedData) => {
  emit('update:rawDataSelected', selectedData);
};
</script>
