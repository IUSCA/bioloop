<template>
  <div
    class="rounded-lg border border-solid border-l-4 transition-colors duration-200"
    :class="TONES[props.decision ?? 'UNDECIDED']"
  >
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex flex-col gap-1">
          <h4 class="text-sm font-semibold">
            <!-- A reviewer is an admin, so an access type carries its identifier in gray. -->
            <AccessTypeName
              v-if="!isPreset"
              :access-type="props.item?.access_type"
              show-identifier
            />
            <template v-else>{{ itemName }}</template>
          </h4>

          <p v-if="itemDescription" class="text-sm va-text-secondary">
            {{ itemDescription }}
          </p>

          <!-- If preset: show covered access types as pills -->
          <div
            v-if="isPreset && presetAccessTypes.length"
            class="mt-1 flex flex-wrap gap-1"
          >
            <Badge
              v-for="accessType in presetAccessTypes"
              :key="accessType.id"
              color="neutral"
              :uppercase="false"
            >
              {{ accessType.description || accessType.name }}
            </Badge>
          </div>

          <p class="text-xs va-text-secondary">{{ requestedUntilNote }}</p>
        </div>

        <div
          class="flex shrink-0 gap-2"
          role="group"
          :aria-label="`Decision for ${decisionLabel}`"
        >
          <button
            type="button"
            :class="[
              CHOICE,
              props.decision === 'APPROVED' ? CHOSEN.APPROVED : UNCHOSEN,
            ]"
            :aria-pressed="props.decision === 'APPROVED'"
            @click="emit('update:decision', 'APPROVED')"
          >
            <i-mdi-check class="text-base" />
            <span>Approve</span>
          </button>
          <button
            type="button"
            :class="[
              CHOICE,
              props.decision === 'REJECTED' ? CHOSEN.REJECTED : UNCHOSEN,
            ]"
            :aria-pressed="props.decision === 'REJECTED'"
            @click="emit('update:decision', 'REJECTED')"
          >
            <i-mdi-close class="text-base" />
            <span>Reject</span>
          </button>
        </div>
      </div>

      <!-- Expiry override (shown only if approved) -->
      <Transition name="fade-slide">
        <div
          v-if="props.decision === 'APPROVED'"
          class="border-t border-solid border-gray-200 pt-3 dark:border-gray-700"
        >
          <p class="v2-card-title mb-2">Approved expiry</p>
          <ExpirySelector v-model="expiryModel" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
/**
 * One requested access type or preset, with the reviewer's approve/reject choice and, once
 * approved, the expiry they are giving.
 *
 * The left border is always four pixels, so a row does not change width when it is decided;
 * only its colour changes, from gray to emerald or red. The two buttons are a segmented
 * choice: the unselected one is an outline, so neither reads as already chosen.
 *
 * @see docs/contributing/v2-design-system.md — Semantic meaning is fixed
 */
import Badge from "@/components/v2/Badge.vue";
import ExpirySelector from "@/components/v2/grants/issue/ExpirySelector.vue";
import * as datetime from "@/services/datetime";
import { computed } from "vue";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  decision: {
    type: String,
    default: null,
    validator: (v) => v === null || v === "APPROVED" || v === "REJECTED",
  },
  approvedExpiry: {
    type: Object,
    default: () => ({ type: "never", value: null }),
  },
});

const emit = defineEmits(["update:decision", "update:approvedExpiry"]);

// The frame stays neutral in all three states, so a column of decided rows keeps one
// rectangle. Only the four-pixel left edge and a faint wash carry the decision.
const TONES = {
  UNDECIDED:
    "border-gray-200 border-l-gray-300 bg-white " +
    "dark:border-gray-700 dark:border-l-gray-600 dark:bg-gray-800/40",
  APPROVED:
    "border-gray-200 border-l-emerald-500 bg-emerald-50/50 " +
    "dark:border-gray-700 dark:border-l-emerald-500 dark:bg-emerald-900/10",
  REJECTED:
    "border-gray-200 border-l-red-500 bg-red-50/50 " +
    "dark:border-gray-700 dark:border-l-red-500 dark:bg-red-900/10",
};

const CHOICE =
  "focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 " +
  "text-sm font-medium border border-solid transition-colors duration-200";

const UNCHOSEN =
  "border-gray-300 dark:border-gray-600 va-text-secondary " +
  "hover:bg-gray-100 dark:hover:bg-gray-700";

const CHOSEN = {
  APPROVED: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
  REJECTED: "border-red-600 bg-red-600 text-white hover:bg-red-700",
};

const isPreset = computed(() => !!props.item?.preset_id);

// A preset's access types arrive as `access_type_items` join rows, each holding the access
// type itself. Reading `preset.access_types` found nothing, so the pills never rendered.
const presetAccessTypes = computed(() =>
  (props.item?.preset?.access_type_items ?? [])
    .map((joinRow) => joinRow.access_type)
    .filter(Boolean),
);

// Only a preset row reads this; an access type row renders AccessTypeName.
const itemName = computed(
  () => props.item?.preset?.name || `Preset ${props.item?.preset_id}`,
);

const itemDescription = computed(() => {
  if (isPreset.value) {
    return props.item?.preset?.description || "";
  }
  return props.item?.access_type?.long_description || "";
});

// Names the row in the button group's accessible label, so a screen reader hears which
// item a bare "Approve" belongs to.
const decisionLabel = computed(() =>
  isPreset.value
    ? itemName.value
    : props.item?.access_type?.description ||
      props.item?.access_type?.name ||
      "this item",
);

const requestedUntilNote = computed(() => {
  if (!props.item?.requested_until) {
    return "Requester asked for: never expires";
  }
  const date = new Date(props.item.requested_until);
  return `Requester asked for: expires ${datetime.displayDate(date)}`;
});

const expiryModel = computed({
  get() {
    return props.approvedExpiry;
  },
  set(value) {
    emit("update:approvedExpiry", value);
  },
});
</script>
