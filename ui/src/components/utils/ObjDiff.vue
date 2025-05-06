<template>
  <VaDataTable :columns="columns" :items="diff" class="table" hoverable />
</template>

<script setup>
const props = defineProps({
  before: Object,
  after: Object,
});

const columns = [
  { key: "key" },
  {
    key: "before",
    tdClass: "text-red-500",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "after",
    tdClass: "text-green-600 dark:text-green-400",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
];

const diff = computed(() => {
  return diffTopLevelProperties(props.before, props.after);
});

function diffTopLevelProperties(before, after) {
  before = before || {};
  after = after || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff = [];
  for (const key of [...keys].sort()) {
    if (before[key] !== after[key]) {
      diff.push({ key, before: before[key], after: after[key] });
    }
  }
  return diff;
}
</script>

<style scoped>
.table {
  --va-data-table-cell-padding: 2px;
}
</style>
