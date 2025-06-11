<template>
  <div class="flex gap-2">
    <va-chip
      v-for="filter in activeFilters"
      :key="filter.key"
      closeable
      @click:close="removeFilter(filter.key)"
    >
      {{ formatFilterLabel(filter.key) }}: {{ formatFilterValue(filter) }}
    </va-chip>
  </div>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";
import * as datetime from "@/services/datetime";

const emit = defineEmits(["search", "open"]);

const store = useAlertStore();
const { filters } = storeToRefs(store);

const activeFilters = computed(() => {
  return Object.entries(filters.value)
    .filter(([_, value]) => value !== null)
    .map(([key, value]) => ({ key, value }));
});

function formatFilterLabel(key) {
  const labels = {
    date_range: "Date Range",
    type: "Type",
  };
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatFilterValue(filter) {
  if (filter.key === "date_range") {
    //   filter.value will be like `{ "start": "2025-06-11T04:00:00.000Z", "end": "2025-06-19T04:00:00.000Z" }`
    return `${datetime.date(filter.value.start)} - ${datetime.date(filter.value.end)}`;
  }
  return filter.value;
}

function removeFilter(key) {
  filters.value[key] = null;
  emit("search");
}
</script>
