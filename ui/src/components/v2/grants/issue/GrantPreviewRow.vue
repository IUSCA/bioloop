<template>
  <div class="flex items-start justify-between gap-4 px-3 py-2.5">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
          {{ props.row.access_type?.description }}
        </span>
      </div>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ note }}</p>
    </div>
    <span
      class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
      :class="badge.classes"
    >
      {{ badge.label }}
    </span>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
const props = defineProps({
  /** { type: 'new'|'existing'|'supersede', access_type_id, expiry, existing_grant, access_type, source } */
  row: {
    type: Object,
    required: true,
  },
});

const BADGE = {
  new: {
    label: "New",
    classes:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  existing: {
    label: "Existing",
    classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  },
  supersede: {
    label: "Extending",
    classes:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
};

const badge = computed(() => BADGE[props.row.type] ?? BADGE.existing);

const fmt = (d) => (d?.type === "never" ? "never" : datetime.date(d?.value));

const note = computed(() => {
  const { type, expiry, existingGrant } = props.row;

  if (type === "new") return `Will be granted · expires ${fmt(expiry)}`;
  if (type === "existing") {
    // existing grant with equal or later valid_until than the approved_until - existing grant remains effective
    return `Existing grant (expires ${fmt(existingGrant?.expiry)}) is broader — new grant skipped`;
  }
  if (type === "supersede") {
    // existing grant with earlier valid_until than the approved_until - new grant would supersede the existing grant
    return `Expiry ${fmt(existingGrant?.expiry)} → ${fmt(expiry)} · extending existing grant`;
  }
  return "";
});
</script>
