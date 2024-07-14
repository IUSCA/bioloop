<template>
  <VaDataTable :columns="columns" :items="diff" class="table" />
</template>

<script setup>
const props = defineProps({
  before: Object,
  after: Object,
});

const columns = [
  { key: "key" },
  { key: "before", tdClass: "text-red-500" },
  { key: "after", tdClass: "text-green-600" },
];

const diff = computed(() => {
  return diffTopLevelProperties(props.before, props.after);
});

function diffTopLevelProperties(before, after) {
  before = before || {};
  after = after || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff = [];
  for (const key of keys) {
    if (before[key] !== after[key]) {
      diff.push({ key, before: before[key], after: after[key] });
    }
  }
  return diff;
}
</script>

<style scoped>
.table {
  --va-data-table-cell-padding: 1px;
}
</style>
