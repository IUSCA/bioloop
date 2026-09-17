<template>
  <VaCard>
    <VaCardContent class="!p-4">
      <h2 class="v2-card-title">Also reaching {{ who }}</h2>
      <p class="mt-1.5 text-sm va-text-secondary">
        {{ blurb }}
      </p>

      <ul class="mt-3 space-y-2.5">
        <li
          v-for="row in props.rows"
          :key="`${row.id}-${row.access_type_name}`"
          class="flex items-start gap-2"
        >
          <i-mdi-check-circle-outline
            class="mt-0.5 shrink-0 va-text-secondary"
          />
          <div class="min-w-0">
            <p class="text-sm font-medium">
              {{ row.access_type_description || row.access_type_name }}
            </p>
            <p class="text-xs va-text-secondary">{{ coverageVia(row) }}</p>
          </div>
        </li>
      </ul>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * Access the subject already holds by some path other than this request.
 *
 * Before a decision this answers the reviewer's first question — does approving actually
 * change anything? After one it prevents the opposite mistake: a revoked grant does not mean
 * the subject lost the access, because another path may still supply it.
 *
 * @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
 */
import { computed } from "vue";

const props = defineProps({
  rows: {
    type: Array,
    required: true,
  },
  /** The name of the user or group the request is for. */
  subjectName: {
    type: String,
    default: null,
  },
  /** Whether the request has been decided, which changes what this card is telling you. */
  decided: {
    type: Boolean,
    default: false,
  },
});

const who = computed(() => props.subjectName || "this user or group");

const blurb = computed(() =>
  props.decided
    ? `Access ${who.value} holds by another path. Revoking the access this request gave does not affect it.`
    : `Access ${who.value} already holds by another path. Approving this does not create it.`,
);

// The same three paths `getEffectiveCoverage` labels, in the reader's words.
function coverageVia(row) {
  if (row.via_collection_name) {
    return `held through the collection ${row.via_collection_name}`;
  }
  if (row.via === "PRINCIPAL") return "held via a system principal";
  if (row.via_group_name) return `held through ${row.via_group_name}`;
  if (row.via === "GROUP") return "held through a group";
  return "held directly";
}
</script>
