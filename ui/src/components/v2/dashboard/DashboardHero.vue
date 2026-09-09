<template>
  <div class="flex flex-col gap-4">
    <div
      class="flex flex-col md:flex-row md:items-start md:justify-between gap-4"
    >
      <div class="min-w-0">
        <p
          v-if="props.eyebrow"
          class="text-xs font-medium uppercase tracking-widest va-text-secondary"
        >
          {{ props.eyebrow }}
        </p>
        <h1
          class="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight"
          :class="props.eyebrow ? '' : 'mt-0'"
        >
          {{ props.title }}
        </h1>
        <p v-if="props.description" class="mt-2 text-sm va-text-secondary">
          {{ props.description }}
        </p>

        <div
          v-if="slots.meta"
          class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm va-text-secondary"
        >
          <slot name="meta" />
        </div>
      </div>

      <div class="flex flex-wrap gap-2 items-center shrink-0">
        <RoleBadge
          v-if="props.roleName"
          :role-name="props.roleName"
          size="base"
        />
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * DashboardHero
 *
 * Purpose:
 * The greeting block at the top of `/v2/home`: who the caller is, what the page is
 * about, and the governance standing they hold.
 *
 * Why it exists:
 * The dashboard is a landing surface rather than a resource page, and it is the one
 * place the type scale goes above 20px. Keeping that exception in a component stops it
 * spreading to the list pages.
 *
 * Responsibilities:
 * - Own the landing-page heading treatment and the placement of the role badge.
 *
 * Not responsible for:
 * - Deciding which role the caller holds. The page maps a persona to a role name.
 * - The meta line's content, which differs per persona and arrives through the slot.
 *
 * @see docs/design/groups/dashboard-plan.md - Phase 1
 * @see docs/contributing/v2-design-system.md - Typography
 */
import { useSlots } from "vue";

const props = defineProps({
  /** Main heading, for example `Hello, Erin`. */
  title: { type: String, required: true },
  /** Small uppercase label above the title. */
  eyebrow: { type: String, default: "" },
  /** One sentence under the title saying what the page shows. */
  description: { type: String, default: "" },
  /** A role name `RoleBadge` understands, for example `ADMIN`. Omit to draw no badge. */
  roleName: { type: String, default: "" },
});

const slots = useSlots();
</script>
