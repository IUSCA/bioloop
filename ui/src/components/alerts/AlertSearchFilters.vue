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
    is_active: "Status",
    start_time: "Start Time",
    end_time: "End Time",
    type: "Type",
  };
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatFilterValue(filter) {
  if (filter.key === "is_active") {
    return filter.value ? "Active" : "Inactive";
  }
  if (["start_time", "end_time"].includes(filter.key)) {
    return `${datetime.date(filter.value[0])} - ${datetime.date(filter.value[1])}`;
  }
  return filter.value;
}

function removeFilter(key) {
  filters.value[key] = null;
  emit("search");
}
</script>
