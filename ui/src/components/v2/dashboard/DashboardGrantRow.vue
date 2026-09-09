<template>
  <div
    class="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-solid border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
  >
    <div class="min-w-0 flex-1 flex flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <SubjectChip
          v-if="props.group.subject"
          :subject="props.group.subject"
        />
        <span aria-hidden="true" class="va-text-secondary">→</span>
        <ResourceChip
          v-if="props.group.resource"
          :resource="props.group.resource"
          link
        />
      </div>

      <p class="text-xs va-text-secondary">
        {{ accessTypeLabel }}
      </p>
    </div>

    <div class="shrink-0 text-right">
      <Badge :color="urgency.color">{{ urgency.label }}</Badge>
      <p class="text-xs va-text-secondary mt-1 whitespace-nowrap">
        {{ expiryDate }}
      </p>
    </div>
  </div>
</template>

<script setup>
/**
 * DashboardGrantRow
 *
 * Purpose:
 * One row of the "grants expiring soon" panel: who holds access on what, which access
 * types are about to lapse, and when the first of them goes.
 *
 * Why it exists:
 * `GET /grants/expiring-soon` groups its rows by subject and resource and returns the
 * access types as a nested array. That is one row to a reader and several grants to the
 * database, and the row has to say so without listing each grant separately.
 *
 * Responsibilities:
 * - Read the grouped shape the endpoint returns, never a flat grant.
 * - Turn days remaining into a tone, so urgency is legible without reading the date.
 *
 * Not responsible for:
 * - Linking to a grant. There is no grant detail page, so the row links to the resource.
 *
 * @see docs/design/groups/dashboard-plan.md - Phase 3
 */
import Badge from "@/components/v2/Badge.vue";
import ResourceChip from "@/components/v2/ResourceChip.vue";
import SubjectChip from "@/components/v2/SubjectChip.vue";
import * as datetime from "@/services/datetime";
import { computed } from "vue";

const props = defineProps({
  /**
   * One `{ subject, resource, grants }` group as `GET /grants/expiring-soon` returns it.
   * Each grant carries `access_type_name` and `valid_until`.
   */
  group: { type: Object, required: true },
});

/**
 * Thresholds in days. A week is the span inside which somebody has to act now, and a
 * fortnight is the span inside which they should plan to. Both are calendar facts rather
 * than tuned values.
 */
const URGENT_DAYS = 7;
const SOON_DAYS = 14;

const grants = computed(() => props.group.grants ?? []);

const accessTypeLabel = computed(() => {
  const names = grants.value
    .map((g) => g.access_type_name)
    .filter(Boolean)
    .map((name) => name.replaceAll("_", " ").toLowerCase());
  return names.length > 0 ? names.join(" · ") : "No access types named";
});

// The rows arrive ordered by expiry, so the first is the one that lapses next.
const firstExpiry = computed(() => grants.value[0]?.valid_until ?? null);

const expiryDate = computed(() =>
  firstExpiry.value ? datetime.date(firstExpiry.value) : "No end date",
);

const urgency = computed(() => {
  if (!firstExpiry.value) return { color: "neutral", label: "No expiry" };

  const days = datetime.daysFromNow(firstExpiry.value);
  if (days <= 0) return { color: "danger", label: "Expired" };
  if (days <= URGENT_DAYS) return { color: "danger", label: `${days}d left` };
  if (days <= SOON_DAYS) return { color: "warning", label: `${days}d left` };
  return { color: "neutral", label: `${days}d left` };
});
</script>
