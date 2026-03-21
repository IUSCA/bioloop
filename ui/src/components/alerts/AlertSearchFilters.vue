<template>
  <div class="flex gap-2">
    <va-chip
      v-for="filter in activeFilters"
      :key="filter.key"
      v-model="chipStates[filter.key]"
      closeable
      outline
    >
      {{ getFilterDisplay(filter) }}
    </va-chip>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";

const emit = defineEmits(["search"]);

const store = useAlertStore();
const { filters } = storeToRefs(store);

const chipStates = ref({});

const activeFilters = computed(() => {
  const _activeFilters = Object.entries(filters.value)
    .filter(([_, value]) => value !== null)
    .map(([key, value]) => ({ key, value }));

  // Initialize chip states
  _activeFilters.forEach((filter) => {
    if (!(filter.key in chipStates.value)) {
      chipStates.value[filter.key] = true;
    }
  });

  return _activeFilters;
});

function formatFilterLabel(key) {
  const labels = {
    start_time: "Start Date",
    end_time: "End Date",
    type: "Type",
    status: "Status",
    is_hidden: "Hidden",
  };
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function formatFilterValue(filter) {
  if (filter.key === "start_time") {
    return `>= ${datetime.date(filter.value)}`;
  }
  if (filter.key === "end_time") {
    return `<= ${datetime.date(filter.value)}`;
  }
  return filter.value;
}

function getFilterDisplay(filter) {
  let ret = formatFilterLabel(filter.key);
  if (filter.key === "start_time" || filter.key === "end_time") {
    ret += ` ${formatFilterValue(filter)}`;
  } else {
    ret += ` : ${formatFilterValue(filter)}`;
  }
  return ret;
}

function removeFilter(key) {
  filters.value[key] = null;
  delete chipStates.value[key];
  emit("search");
}

watch(
  chipStates,
  (newStates) => {
    Object.keys(newStates).forEach((key) => {
      if (newStates[key] === false) {
        removeFilter(key);
      }
    });
  },
  { deep: true },
);
</script>
