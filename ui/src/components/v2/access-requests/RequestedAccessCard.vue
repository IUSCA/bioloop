<template>
  <VaCard>
    <VaCardContent class="!p-4">
      <h2 class="v2-card-title">Requested access</h2>

      <div
        class="mt-3 divide-y divide-solid divide-gray-100 dark:divide-gray-800"
      >
        <div
          v-for="item in props.items"
          :key="item.id"
          class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div class="min-w-0">
            <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="text-sm font-medium">{{ itemName(item) }}</span>
              <span
                v-if="itemIdentifier(item)"
                class="font-mono text-xs va-text-secondary"
              >
                {{ itemIdentifier(item) }}
              </span>
              <Badge v-if="item.preset" color="neutral">Preset</Badge>
            </p>
            <p
              v-if="itemDescription(item)"
              class="mt-0.5 text-sm va-text-secondary"
            >
              {{ itemDescription(item) }}
            </p>

            <!--
              A preset is the unit of intent, so it stays the row; the types it covers are
              chips underneath rather than rows of their own.
              @see docs/design/groups/design.md — A request names presets and access types
            -->
            <div
              v-if="presetAccessTypes(item).length"
              class="mt-2 flex flex-wrap gap-1"
            >
              <Badge
                v-for="accessType in presetAccessTypes(item)"
                :key="accessType.id"
                color="neutral"
                :uppercase="false"
              >
                {{ accessType.description || accessType.name }}
              </Badge>
            </div>
          </div>

          <div class="shrink-0 text-right">
            <Badge :color="DECISION_TONE[item.decision] || 'neutral'">
              {{ (item.decision || "PENDING").replaceAll("_", " ") }}
            </Badge>
            <p class="mt-1 text-xs va-text-secondary">
              {{ expiryLabel(item) }}
            </p>
          </div>
        </div>
      </div>

      <!-- The reviewer's own words, which the per-item decisions do not carry. -->
      <div
        v-if="props.decisionReason"
        class="mt-4 border-t border-solid border-gray-100 pt-3 dark:border-gray-800"
      >
        <h3 class="v2-card-title">Reviewer's note</h3>
        <p class="mt-1.5 text-sm">{{ props.decisionReason }}</p>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * What an access request asked for, one row per item, with each item's decision.
 *
 * A row leads with the access type's human label and carries its identifier as monospace
 * secondary text. Leading with `DATASET:LIST_FILES` puts the least readable part of the row
 * where the eye lands first, and a reviewer scanning a queue is reading meaning, not
 * identifiers.
 *
 * @see docs/public/mockups/access-request-screens.html — Requested access
 */
import Badge from "@/components/v2/Badge.vue";
import * as datetime from "@/services/datetime";

const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  /** The reviewer's free-text note on the request as a whole. */
  decisionReason: {
    type: String,
    default: "",
  },
});

const DECISION_TONE = {
  PENDING: "neutral",
  APPROVED: "success",
  REJECTED: "danger",
};

// `description` is the short human label — "Browse file tree" — and `name` is the identifier.
// A preset carries only a name, and it is already written for people.
function itemName(item) {
  return (
    item.preset?.name ||
    item.access_type?.description ||
    item.access_type?.name ||
    `Access type ${item.access_type_id}`
  );
}

function itemIdentifier(item) {
  return item.preset ? "" : item.access_type?.name || "";
}

function itemDescription(item) {
  return item.preset?.description || item.access_type?.long_description || "";
}

// A preset's access types arrive as join rows, each carrying the access type itself.
function presetAccessTypes(item) {
  return (item.preset?.access_type_items ?? [])
    .map((joinRow) => joinRow.access_type)
    .filter(Boolean);
}

// `approved_until` is what the reviewer settled on; `requested_until` is what was asked for.
// Both are null when the ask was "never expires".
function expiryLabel(item) {
  if (item.decision === "APPROVED") {
    return item.approved_until
      ? `Until ${datetime.date(item.approved_until)}`
      : "No end date";
  }
  return item.requested_until
    ? `Asked until ${datetime.date(item.requested_until)}`
    : "Asked with no end date";
}
</script>
