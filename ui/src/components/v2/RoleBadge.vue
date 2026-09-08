<template>
  <span
    v-if="props.roleName"
    :class="[
      role.color,
      SIZES[props.size].chip,
      props.border ? 'border border-solid border-current' : '',
    ]"
    class="shrink-0 inline-flex items-center gap-1 font-semibold uppercase tracking-wide"
  >
    <Icon :icon="role.icon" :class="SIZES[props.size].icon" />
    {{ role.text }}
  </span>
</template>

<script setup>
/**
 * RoleBadge
 *
 * Purpose:
 * Renders one ABAC role — a group membership role or the caller's role on a
 * resource — as a tinted badge with a role-specific icon and label.
 *
 * Why it exists:
 * The role a viewer holds is the single most-read fact on a governance screen, and
 * it appears on group cards, member tables, and every resource detail header. One
 * component keeps the hue, icon, and wording of a given role identical everywhere,
 * so a reader learns the mapping once.
 *
 * Responsibilities:
 * - Own the hue, icon, and display text for every role the API can return.
 * - Refuse an unrecognised `size` rather than resolving it to a fallback.
 *
 * Not responsible for:
 * - Deciding whether the viewer may act. Capabilities come from `_meta.capabilities`.
 * - Unknown role names, which render with their raw value in the neutral tone so a
 *   new backend role is visible rather than hidden.
 *
 * @see docs/contributing/v2-design-system.md — The primitive set
 * @see docs/design/groups/design.md
 */
import { computed } from "vue";

const props = defineProps({
  /** A role name as the API returns it, for example `ADMIN` or `TRANSITIVE_MEMBER`. */
  roleName: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    default: "sm",
    validator: (v) => ["sm", "base", "lg"].includes(v),
  },
  /** Draws a hairline in the badge's own color, for use on a tinted surface. */
  border: {
    type: Boolean,
    default: false,
  },
});

// Class strings are complete literals so Tailwind's scanner can see them.
const SIZES = {
  sm: { chip: "text-[11px] px-1.5 py-0.5 rounded-md", icon: "text-sm" },
  base: { chip: "text-sm px-2 py-1 rounded-md", icon: "text-base" },
  lg: { chip: "text-base px-3 py-1.5 rounded-lg", icon: "text-lg" },
};

const ROLES = {
  PLATFORM_ADMIN: {
    color: "text-red-700 bg-red-500/10 dark:text-red-400 dark:bg-red-400/10",
    icon: "mdi-crown-outline",
    text: "Platform Admin",
  },
  ADMIN: {
    color:
      "text-amber-700 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10",
    icon: "mdi-shield-crown-outline",
    text: "Admin",
  },
  OVERSIGHT: {
    color:
      "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-400/10",
    icon: "mdi-eye-outline",
    text: "Oversight",
  },
  GRANT_HOLDER: {
    color:
      "text-violet-700 bg-violet-500/10 dark:text-violet-400 dark:bg-violet-400/10",
    icon: "mdi-certificate-outline",
    text: "Grant Holder",
  },
  MEMBER: {
    color: "text-sky-700 bg-sky-500/10 dark:text-sky-400 dark:bg-sky-400/10",
    icon: "mdi-account-outline",
    text: "Member",
  },
  TRANSITIVE_MEMBER: {
    color:
      "text-indigo-700 bg-indigo-500/10 dark:text-indigo-400 dark:bg-indigo-400/10",
    icon: "mdi-account-arrow-right-outline",
    text: "Member (Transitive)",
  },
};

const NEUTRAL =
  "text-slate-500 bg-slate-500/10 dark:text-slate-400 dark:bg-slate-400/10";

const role = computed(
  () =>
    ROLES[props.roleName] ?? {
      color: NEUTRAL,
      icon: "mdi-account-outline",
      text: props.roleName,
    },
);
</script>
