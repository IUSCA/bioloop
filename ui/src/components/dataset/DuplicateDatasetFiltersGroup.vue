<template>
  <va-button-dropdown
    :label="`Filters${activeCountText}`"
    :close-on-content-click="false"
  >
    <div class="flex flex-col gap-1">
      <va-checkbox
        v-for="(filter, i) in checkboxFilters"
        :key="i"
        v-model="checkboxes[filter.field]"
        :label="filter.label"
        @update:model-value="handle_filters"
      />
    </div>
  </va-button-dropdown>
</template>

<script setup>
const props = defineProps({
  filters: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update"]);

const filtersConfig = [
  {
    field: "deleted",
    label: "Deleted",
  },
];

const checkboxFilters = computed(() => {
  if (props.filters.length === 0) {
    return filtersConfig;
  }
  return filtersConfig.filter((e) => {
    return props.filters.includes(e.field);
  });
});

const checkboxes = ref({
  deleted: false,
});

const activeCountText = computed(() => {
  const activeCount = Object.values(checkboxes.value).reduce(
    (acc, curr) => acc + curr,
    0,
  );
  return activeCount > 0 ? ` (${activeCount})` : "";
});

function handle_filters() {
  const opts = checkboxes.value;
  const query = {
    deleted: opts.deleted,
  };
  emit("update", query);
}
</script>
