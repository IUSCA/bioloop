<template>
  <div
    :class="[
      'flex flex-col gap-1 py-2.5 px-3 border-b border-solid border-gray-200 dark:border-gray-700 last:border-b-0',
      props.grant.revoked_at !== null ? 'opacity-60' : '',
    ]"
  >
    <!-- Access Type Name -->
    <span
      :class="[
        'text-sm font-medium text-gray-900 dark:text-gray-100',
        props.grant.revoked_at !== null ? 'line-through' : '',
      ]"
    >
      {{
        props.accessTypeMap[props.grant.access_type_id]?.name ??
        "Unknown access type"
      }}
    </span>

    <!-- Access Type Description -->
    <span
      v-if="props.grant.access_type?.description"
      class="text-xs text-gray-600 dark:text-gray-400 mt-0.5"
    >
      {{ props.grant.access_type.description }}
    </span>

    <!-- Tag Row -->
    <div class="flex flex-wrap gap-1.5 mt-1">
      <span
        v-if="props.grant.creation_type === 'ACCESS_REQUEST'"
        class="text-xs font-medium px-2 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"
      >
        Access request
      </span>
      <span
        v-if="props.grant.creation_type === 'MANUAL'"
        class="text-xs font-medium px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
      >
        Manual
      </span>
      <span
        v-if="props.grant.creation_type === 'SYSTEM_BOOTSTRAP'"
        class="text-xs font-medium px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
      >
        System
      </span>
      <span
        v-if="props.grant.revoked_at !== null"
        class="text-xs font-medium px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500"
      >
        Revoked
      </span>
      <span
        v-if="props.grant.source_preset"
        class="text-xs font-medium px-2 py-0.5 rounded-sm bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300"
      >
        {{ props.grant.source_preset.name }}
      </span>
      <span
        v-if="props.grant.resource?.type === 'COLLECTION'"
        class="text-xs font-medium px-2 py-0.5 rounded-sm bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300"
      >
        via collection
      </span>
    </div>

    <!-- Date Row -->
    <div class="flex items-center gap-1.5 text-xs mt-1">
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
      class="mt-1 self-start text-xs px-3 py-1.5 rounded-md border border-solid text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
      @click.stop="emit('revoke', props.grant.id)"
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
