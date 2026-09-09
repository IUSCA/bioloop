<template>
  <VaCard class="h-full">
    <VaCardContent>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">{{ props.title }}</h2>
            <Badge v-if="props.count !== null" :color="props.countColor">
              {{ props.count }}
            </Badge>
          </div>
          <p v-if="props.subtitle" class="text-sm va-text-secondary">
            {{ props.subtitle }}
          </p>
        </div>

        <div v-if="slots.actions" class="flex items-center gap-2 shrink-0">
          <slot name="actions" />
        </div>

        <RouterLink
          v-else-if="props.to"
          :to="props.to"
          class="text-sm font-semibold shrink-0"
          style="color: var(--va-primary)"
        >
          {{ props.linkLabel }}
        </RouterLink>
      </div>

      <div class="mt-4">
        <slot />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * DashboardSection
 *
 * Purpose:
 * One panel on `/v2/home`: a title, an optional count, an optional link to the page
 * that holds the rest, and the rows themselves.
 *
 * Why it exists:
 * The dashboard is a stack of panels that differ only in their content. One wrapper
 * keeps their heading size, count badge, and "view all" affordance identical, so a
 * reader learns the shape once.
 *
 * Responsibilities:
 * - Own the panel chrome and the placement of the count and the trailing link.
 *
 * Not responsible for:
 * - Fetching. `home.vue` owns every call, so a panel never issues one of its own and
 *   two panels never ask the same question twice.
 * - Loading and empty states, which the caller renders in the default slot.
 *
 * @see docs/design/groups/dashboard-plan.md - Phase 1
 */
import { useSlots } from "vue";

const props = defineProps({
  title: { type: String, required: true },
  /** One line saying what the panel holds. */
  subtitle: { type: String, default: "" },
  /** Total behind the panel, drawn as a badge beside the title. `null` draws nothing. */
  count: { type: [Number, String], default: null },
  /** Tone of the count badge. A meaning, never a hue. */
  countColor: {
    type: String,
    default: "neutral",
    validator: (v) =>
      ["primary", "success", "warning", "danger", "neutral"].includes(v),
  },
  /** Route for the trailing link. Ignored when the `actions` slot is filled. */
  to: { type: String, default: "" },
  /** Label for that link. */
  linkLabel: { type: String, default: "View all →" },
});

const slots = useSlots();
</script>
