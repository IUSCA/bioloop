<template>
  <div class="flex gap-2">
    <va-chip
      v-for="filter in activeFilters"
      :key="filter.key"
      closeable
      @click:close="removeFilter(filter.key)"
    >
      {{ filter.label }}: {{ filter.value }}
    </va-chip>
  </div>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";

const emit = defineEmits(["search", "open"]);

const store = useAlertStore();
const { filters } = storeToRefs(store);

const activeFilters = computed(() => {
  return Object.entries(filters.value)
    .filter(([_, value]) => value !== null)
    .map(([key, value]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value: typeof value === "boolean" ? (value ? "Yes" : "No") : value,
    }));
});

function removeFilter(key) {
  filters.value[key] = null;
  emit("search");
}
</script>
