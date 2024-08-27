<template>
  <VaDataTable
    class="object-table"
    :columns="columns"
    :items="objectToKVArray(props.object || {})"
  />
</template>

<script setup>
const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
});

const columns = [
  {
    key: "key",
    sortable: true,
  },
  {
    key: "value",
    sortable: true,
  },
];

function objectToKVArray(obj) {
  // if value is an object or array, stringify it

  return Object.entries(obj).map(([key, value]) => {
    if (typeof value === "object") {
      value = JSON.stringify(value);
    }
    return { key, value };
  });
}
</script>

<style scoped>
.object-table {
  --va-data-table-cell-padding: 8px;
}
</style>
