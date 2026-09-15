<template>
  <VaCard>
    <VaCardContent class="!p-4">
      <h2 class="v2-card-title">Access from this request</h2>

      <div class="mt-3 grid grid-cols-3 gap-2">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="rounded-lg border border-solid border-gray-200 px-2.5 py-2 dark:border-gray-700"
        >
          <p class="text-xl font-semibold leading-none" :class="stat.tone">
            {{ stat.value }}
          </p>
          <p
            class="mt-1.5 text-2xs font-semibold uppercase tracking-wide va-text-secondary"
          >
            {{ stat.label }}
          </p>
        </div>
      </div>

      <!--
        An APPROVED request whose grants were all revoked reads as access the requester does
        not have. Saying so is the highest-value line on this page.
        @see docs/design/groups/implementation/access-requests-plan.md — C4
      -->
      <Alert
        v-if="props.summary.issued === 0"
        color="info"
        class="mt-3 text-sm"
      >
        This request issued no grants. Anything approved was already covered by
        access the subject holds.
      </Alert>
      <Alert
        v-else-if="props.summary.live === 0"
        color="danger"
        class="mt-3 text-sm"
      >
        Nothing from this request is in force any more.
        <template v-if="props.summary.last_revoked_at">
          The last grant was revoked
          {{ datetime.fromNowShort(props.summary.last_revoked_at)
          }}<template v-if="props.summary.last_revocation_type">
            ({{ props.summary.last_revocation_type.toLowerCase() }})</template
          >.
        </template>
      </Alert>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * What a decided access request actually produced, and how much of it is still live.
 *
 * The three counts are exclusive and exhaustive, so they sum to the number of grants the
 * request issued. They lead the rail because "what does this give me right now" is the
 * question a decided request gets asked, and the status badge alone answers it wrongly
 * whenever a grant has since been revoked.
 *
 * @see docs/design/groups/implementation/access-requests-plan.md — C4
 */
import Alert from "@/components/utils/ModernAlert.vue";
import * as datetime from "@/services/datetime";
import { computed } from "vue";

const props = defineProps({
  summary: {
    type: Object,
    required: true,
  },
});

const stats = computed(() => [
  {
    label: "Live",
    value: props.summary.live ?? 0,
    tone:
      props.summary.live > 0
        ? "text-emerald-700 dark:text-emerald-400"
        : "va-text-secondary",
  },
  {
    label: "Revoked",
    value: props.summary.revoked ?? 0,
    tone:
      props.summary.revoked > 0
        ? "text-red-700 dark:text-red-400"
        : "va-text-secondary",
  },
  {
    label: "Expired",
    value: props.summary.expired ?? 0,
    tone:
      props.summary.expired > 0
        ? "text-amber-700 dark:text-amber-400"
        : "va-text-secondary",
  },
]);
</script>
