<template>
  <div class="flex flex-col gap-4">
    <section v-for="group in groups" :key="group.category">
      <!-- On a collection, dataset types apply to the datasets it holds. -->
      <p
        v-if="group.startsDatasetTypes"
        class="mb-3 border-t border-solid border-gray-200 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400"
      >
        Datasets in this collection
      </p>
      <h4
        class="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        {{ group.label }}
      </h4>

      <div class="flex flex-col">
        <div
          v-for="type in group.types"
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
              <AccessTypeName
                :access-type="type"
                :show-identifier="props.showIdentifier"
                :label-class="[
                  'text-sm font-medium',
                  model?.has(type.id)
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-gray-800 dark:text-gray-200',
                ]"
              />
              <span
                v-if="isCovered(type.id)"
                class="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              >
                {{ coverLabel(type.id) }}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {{ type.long_description }}
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * Access types grouped under headings, each a row the caller ticks.
 *
 * The API returns the types already ordered by heading and by position under it, so this
 * groups consecutive rows rather than sorting them again.
 * @see docs/design/groups/ui-information-architecture.md — Access types in forms
 */

// Model holds the set of access type IDs selected by the user in this component
const model = defineModel();

const props = defineProps({
  /**
   * Access types in display order:
   * { id, name, description, long_description, category, category_label, implies: number[] }
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
  /**
   * Map<number, string> of IDs the subject already holds, to the words saying how. A held
   * type is shown ticked and cannot be picked.
   */
  heldReasons: {
    type: Map,
    default: () => new Map(),
  },
  /** Shows each type's identifier as small gray text. Admin surfaces only. */
  showIdentifier: {
    type: Boolean,
    default: false,
  },
  /** The resource the access is for. A collection gets a heading over its dataset types. */
  resourceType: {
    type: String,
    default: "",
  },
});

/** Consecutive types sharing a category, each group under its heading. */
const groups = computed(() => {
  const result = [];
  for (const type of props.accessTypes) {
    const last = result[result.length - 1];
    if (last && last.category === type.category) {
      last.types.push(type);
    } else {
      result.push({
        category: type.category,
        label: type.category_label,
        types: [type],
        startsDatasetTypes: false,
      });
    }
  }
  if (props.resourceType === "COLLECTION") {
    const firstDatasetGroup = result.find((g) => g.category !== "COLLECTION");
    if (firstDatasetGroup) firstDatasetGroup.startsDatasetTypes = true;
  }
  return result;
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

/** Why a type cannot be picked, or null when it can. */
function coverLabel(id) {
  if (props.heldReasons.has(id)) return props.heldReasons.get(id);
  if (props.presetCoveredIds.has(id)) return "via preset";
  const implying = impliedBySelection.value.get(id);
  return implying ? `via ${implying.description}` : null;
}

function isCovered(id) {
  return coverLabel(id) !== null;
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

// A change of subject can make a ticked type one they already hold, so it is dropped.
watch(
  () => props.heldReasons,
  (held) => {
    if (!model.value?.size) return;
    const next = new Set([...model.value].filter((id) => !held.has(id)));
    if (next.size !== model.value.size) model.value = next;
  },
);
</script>
