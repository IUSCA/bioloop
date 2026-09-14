<template>
  <div
    :class="[
      'flex flex-col gap-1 py-2.5 px-3 border-b border-solid border-gray-200 dark:border-gray-700 last:border-b-0',
      props.grant.revoked_at !== null ? 'opacity-60' : '',
    ]"
  >
    <!-- The label leads and the identifier follows in gray, because an admin reads this tab. -->
    <AccessTypeName
      :access-type="accessType"
      show-identifier
      :label-class="[
        'text-base font-medium text-gray-900 dark:text-gray-100',
        props.grant.revoked_at !== null ? 'line-through' : '',
      ]"
    />

    <span
      v-if="accessType?.long_description"
      class="text-sm text-gray-600 dark:text-gray-400 mt-0.5"
    >
      {{ accessType.long_description }}
    </span>

    <!-- What the order confers beyond this grant's own name. A grant of Download satisfies
         every check for Browse file tree and See dataset exists, so a reader looking for
         those should find them here rather than expect another row.
         @see docs/design/groups/decisions.md — 7. Access types imply one another -->
    <span
      v-if="alsoConfers.length && props.grant.revoked_at === null"
      class="text-sm text-gray-500 dark:text-gray-500 mt-0.5"
    >
      Also confers {{ alsoConfers.join(", ") }}
    </span>

    <!-- Tag Row -->
    <div class="flex flex-wrap gap-1.5 mt-1">
      <Badge
        v-if="props.grant.creation_type === 'ACCESS_REQUEST'"
        color="primary"
      >
        Access request
      </Badge>
      <Badge v-if="props.grant.creation_type === 'MANUAL'" color="neutral">
        Manual
      </Badge>
      <Badge
        v-if="props.grant.creation_type === 'SYSTEM_BOOTSTRAP'"
        color="neutral"
      >
        System
      </Badge>
      <Badge v-if="props.grant.revoked_at !== null" color="neutral">
        Removed
      </Badge>
      <Badge v-if="props.grant.source_preset" color="violet" :uppercase="false">
        {{ props.grant.source_preset.name }}
      </Badge>
      <Badge v-if="props.grant.resource?.type === 'COLLECTION'" color="teal">
        via collection
      </Badge>
    </div>

    <!-- Date Row -->
    <div class="flex items-center gap-1.5 text-sm mt-1">
      <span class="text-gray-600 dark:text-gray-400"
        >Granted {{ datetime.date(props.grant.valid_from) }}</span
      >
      <span class="text-gray-400 dark:text-gray-500">·</span>
      <span :class="expiryTextClass">{{ expiryText }}</span>
    </div>

    <!-- Provenance Box -->
    <GrantProvenanceBox
      :grant="props.grant"
      :can-navigate-to-request="props.canNavigateToRequest"
      @navigate-to-request="emit('navigate-to-request', $event)"
    />

    <!-- Revoke Button -->
    <button
      v-if="props.canRevoke && props.grant.revoked_at === null"
      type="button"
      class="mt-1 self-start text-sm px-3 py-1.5 rounded-md border border-solid text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
      @click.stop="emit('revoke', props.grant)"
    >
      Revoke
    </button>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { daysUntilExpiry } from "./grantExpiry.js";

const props = defineProps({
  grant: { type: Object, required: true },
  accessTypeMap: { type: Object, required: true },
  canRevoke: { type: Boolean, default: false },
  canNavigateToRequest: { type: Boolean, default: false },
});

const accessType = computed(
  () =>
    props.accessTypeMap[props.grant.access_type_id] ?? props.grant.access_type,
);

/**
 * The access this grant confers through the access-type order, beyond its own type.
 *
 * Names them by description, because that is what the rest of the row shows and what the
 * selector offered when the grant was issued.
 */
const alsoConfers = computed(() => {
  const implied =
    props.accessTypeMap[props.grant.access_type_id]?.implies ?? [];
  return implied
    .map((id) => props.accessTypeMap[id]?.description)
    .filter(Boolean);
});

const emit = defineEmits(["revoke", "navigate-to-request"]);

const expiryText = computed(() => {
  if (!props.grant.expiry || props.grant.expiry.type === "never")
    return "No expiry";
  const days = daysUntilExpiry(props.grant);
  if (days < 0) return `Expired ${datetime.date(props.grant.expiry.value)}`;
  if (days === 0) return "Expires today";
  if (days <= 14) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  return `Expires ${datetime.date(props.grant.expiry.value)}`;
});

const expiryTextClass = computed(() => {
  if (!props.grant.expiry || props.grant.expiry.type === "never")
    return "text-gray-600 dark:text-gray-400";
  const days = daysUntilExpiry(props.grant);
  if (days <= 14) return "text-red-700 dark:text-red-400 font-medium";
  return "text-gray-600 dark:text-gray-400";
});
</script>
