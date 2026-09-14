<template>
  <span class="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
    <span :class="props.labelClass">{{ label }}</span>
    <span
      v-if="props.showIdentifier && props.accessType?.name"
      class="font-mono text-xs text-gray-400 dark:text-gray-500"
    >
      {{ props.accessType.name }}
    </span>
  </span>
</template>

<script setup>
/**
 * An access type's human label, followed by its identifier as small gray text where an admin
 * is reading.
 *
 * `description` holds the short label, such as "Browse file tree", and `name` holds the
 * identifier, such as `DATASET:LIST_FILES`.
 * @see docs/design/groups/ui-information-architecture.md — Access types in forms
 */
const props = defineProps({
  /** An access type, or any object carrying its `name` and `description`. */
  accessType: {
    type: Object,
    default: null,
  },
  /** Shows the identifier after the label. Admin surfaces only. */
  showIdentifier: {
    type: Boolean,
    default: false,
  },
  /** Classes for the label itself, so a caller keeps its own size and weight. */
  labelClass: {
    type: [String, Array, Object],
    default: "",
  },
});

const label = computed(
  () =>
    props.accessType?.description ||
    props.accessType?.name ||
    "Unknown access type",
);
</script>
