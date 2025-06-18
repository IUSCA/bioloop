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
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";
import * as datetime from "@/services/datetime";

const emit = defineEmits(["search"]);

const store = useAlertStore();
const { filters } = storeToRefs(store);

const chipStates = ref({});

const activeFilters = computed(() => {
  const active = Object.entries(filters.value)
    .filter(([_, value]) => value !== null)
    .map(([key, value]) => ({ key, value }));

  // Initialize chip states
  active.forEach((filter) => {
    if (!(filter.key in chipStates.value)) {
      chipStates.value[filter.key] = true;
    }
  });

  return active;
});

function formatFilterLabel(key) {
  const labels = {
    start_time: "Start Date",
    end_time: "End Date",
    type: "Type",
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
  console.log("Removing filter:", key);
  console.log("filters before removal:", filters.value);
  filters.value[key] = null;
  console.log("filters after removal:", filters.value);
  delete chipStates.value[key];
  emit("search");
}

watch(
  chipStates,
  (newStates) => {
    // console.log("chipStates changed: oldStates", oldStates);
    // console.log("chipStates changed: newStates", newStates);
    Object.keys(newStates).forEach((key) => {
      if (
        newStates[key] === false
        // && oldStates[key] === true
      ) {
        removeFilter(key);
      }
    });
  },
  { deep: true },
);
</script>
