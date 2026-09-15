<template>
  <Badge
    v-if="props.roleName"
    :color="role.color"
    :size="props.size"
    :icon="role.icon"
    :border="props.border"
  >
    {{ role.text }}
  </Badge>
</template>

<script setup>
/**
 * RoleBadge
 *
 * Purpose:
 * Renders one ABAC role — a group membership role or the caller's role on a
 * resource — as a `Badge` with a role-specific tone, icon, and label.
 *
 * Why it exists:
 * The role a viewer holds is the single most-read fact on a governance screen, and
 * it appears on group cards, member tables, and every resource detail header. One
 * component keeps the tone, icon, and wording of a given role identical everywhere,
 * so a reader learns the mapping once.
 *
 * Responsibilities:
 * - Own the role-to-tone, role-to-icon, and role-to-label maps.
 *
 * Not responsible for:
 * - The visual recipe, which belongs to `Badge.vue`.
 * - Deciding whether the viewer may act. Capabilities come from `_meta.capabilities`.
 * - Unknown role names, which render with their raw value in the neutral tone so a
 *   new backend role is visible rather than hidden.
 *
 * @see docs/contributing/v2-design-system.md - The primitive set
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

const ROLES = {
  PLATFORM_ADMIN: {
    color: "danger",
    icon: "mdi-crown-outline",
    text: "Platform Admin",
  },
  ADMIN: {
    color: "warning",
    icon: "mdi-shield-crown-outline",
    text: "Admin",
  },
  OVERSIGHT: {
    color: "success",
    icon: "mdi-eye-outline",
    text: "Oversight",
  },
  GRANT_HOLDER: {
    color: "violet",
    icon: "mdi-certificate-outline",
    text: "Grant Holder",
  },
  MEMBER: {
    color: "sky",
    icon: "mdi-account-outline",
    text: "Member",
  },
  TRANSITIVE_MEMBER: {
    color: "indigo",
    icon: "mdi-account-arrow-right-outline",
    text: "Member (Transitive)",
  },
  RESOURCE_ACCESS: {
    color: "violet",
    icon: "mdi-certificate-outline",
    text: "Resource Access",
  },
  PROFILE_VIEWER: {
    color: "neutral",
    icon: "mdi-card-account-details-outline",
    text: "Profile Viewer",
  },
};

const role = computed(
  () =>
    ROLES[props.roleName] ?? {
      color: "neutral",
      icon: "mdi-account-outline",
      text: props.roleName,
    },
);
</script>
