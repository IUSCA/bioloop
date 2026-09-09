<template>
  <div class="flex flex-col">
    <div
      v-for="type in props.accessTypes"
      :key="type.id"
      class="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors"
      :class="{
        'cursor-default opacity-50': isCovered(type.id),
        'bg-blue-50 dark:bg-blue-950': model?.has(type.id),
      }"
      :aria-disabled="isCovered(type.id)"
      @click="toggle(type.id)"
      @keydown.enter.prevent="toggle(type.id)"
      @keydown.space.prevent="toggle(type.id)"
      tabindex="0"
      role="button"
    >
      <VaCheckbox
        :model-value="model?.has(type.id) || isCovered(type.id)"
        :disabled="isCovered(type.id)"
        class="mt-0.5 shrink-0 pointer-events-none"
        :aria-label="type.description"
      />
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="text-sm font-medium"
            :class="
              model?.has(type.id)
                ? 'text-blue-700 dark:text-blue-300'
                : 'text-gray-800 dark:text-gray-200'
            "
          >
            {{ type.description }}
          </span>
          <span
            v-if="isCovered(type.id)"
            class="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300"
          >
            {{
              coveredBy(type.id) === "preset"
                ? "via preset"
                : `via ${coveredBy(type.id)}`
            }}
          </span>
        </div>
        <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          {{ type.long_description }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
// Model holds the set of access type IDs selected by the user in this component
const model = defineModel();

const props = defineProps({
  /**
   * Full list of access type objects:
   * { id, name, description, long_description, implies: number[] }
   */
  accessTypes: {
    type: Array,
    required: true,
  },
  /** Set<number> of IDs already covered by the selected preset */
  presetCoveredIds: {
    type: Set,
    default: () => new Set(),
  },
});

/**
 * Which selected access type already confers each other type, keyed by the conferred id.
 *
 * Access types carry a partial order, so selecting Download also confers Browse file tree
 * and See dataset exists. Offering those as separate choices invites an admin to grant
 * three rows for one fact.
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */
const impliedBySelection = computed(() => {
  const byId = new Map();
  for (const type of props.accessTypes) {
    if (!model.value?.has(type.id)) continue;
    for (const impliedId of type.implies ?? []) {
      if (!byId.has(impliedId)) byId.set(impliedId, type);
    }
  }
  return byId;
});

/** A type the admin cannot pick, because something already selected supplies it. */
function coveredBy(id) {
  if (props.presetCoveredIds.has(id)) return "preset";
  return impliedBySelection.value.get(id)?.description ?? null;
}

function isCovered(id) {
  return coveredBy(id) !== null;
}

function toggle(id) {
  if (isCovered(id)) return;
  const next = new Set(model.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);

  // Selecting a wider type absorbs the narrower ones already ticked, so the request names
  // one access type per fact and matches the grants it will produce.
  const selectedTypes = props.accessTypes.filter((t) => next.has(t.id));
  for (const type of selectedTypes) {
    for (const impliedId of type.implies ?? []) next.delete(impliedId);
  }

  model.value = next;
}
</script>
