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
import { lxor } from "@/services/utils";

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
  {
    field: "saved",
    label: "Saved",
  },
  {
    field: "archived",
    label: "Archived",
  },

  {
    field: "staged",
    label: "Staged",
  },
  {
    field: "processed",
    label: "Processed",
  },
  {
    field: "unprocessed",
    label: "Unprocessed",
  },
];

const checkboxes = ref({
  deleted: false,
  saved: false,
  archived: false,
  staged: false,
  unprocessed: false,
  processed: false,
});

const activeCountText = computed(() => {
  const activeCount = Object.values(checkboxes.value).reduce(
    (acc, curr) => acc + curr,
    0,
  );
  return activeCount > 0 ? ` (${activeCount})` : "";
});

const checkboxFilters = computed(() => {
  if (props.filters.length === 0) {
    return filtersConfig;
  }
  return filtersConfig.filter((e) => {
    return props.filters.includes(e.field);
  });
});

function handle_filters() {
  const opts = checkboxes.value;
  const query = {
    deleted: lxor(opts.deleted, opts.saved) ? opts.deleted : null,
    processed: lxor(opts.unprocessed, opts.processed) ? opts.processed : null,
    staged: opts.staged ? opts.staged : null,
    archived: opts.archived ? opts.archived : null,
  };
  emit("update", query);
}
</script>
