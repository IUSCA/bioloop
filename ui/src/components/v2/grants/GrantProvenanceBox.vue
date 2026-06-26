<template>
  <div
    class="mt-1.5 px-3 py-2 rounded-md border-l-2 border-r border-t border-b border-solid bg-gray-50 dark:bg-gray-900/30 border-l-gray-400 dark:border-l-gray-500 border-r-gray-200 dark:border-r-gray-700 border-t-gray-200 dark:border-t-gray-700 border-b-gray-200 dark:border-b-gray-700 flex flex-col gap-1"
  >
    <!-- Grant on (collection grants) -->
    <div
      v-if="props.grant.resource?.type === 'COLLECTION'"
      class="flex gap-2 text-xs"
    >
      <span
        class="w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400"
        >Grant on</span
      >
      <span class="text-gray-700 dark:text-gray-300">
        Collection: {{ props.grant.resource?.name }} — covers all datasets in
        this collection
      </span>
    </div>

    <!-- Origin -->
    <div class="flex gap-2 text-xs">
      <span
        class="w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400"
      >
        Origin
      </span>
      <span class="text-gray-700 dark:text-gray-300">
        <template v-if="props.grant.creation_type === 'ACCESS_REQUEST'">
          Approved via access request
          <button
            v-if="
              props.canNavigateToRequest &&
              props.grant.source_access_request?.id
            "
            type="button"
            class="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer ml-1 bg-transparent"
            @click.stop="
              emit('navigate-to-request', props.grant.source_access_request.id)
            "
          >
            #{{ props.grant.source_access_request.id }}
          </button>
          <template v-if="props.grant.issuing_authority">
            · approved by {{ props.grant.issuing_authority.name }}
          </template>
          <template v-if="props.grant.source_access_request?.requester">
            on behalf of
            {{
              props.grant.source_access_request.requester.name ||
              props.grant.source_access_request.requester.email
            }}
          </template>
          <span
            v-if="props.grant.source_access_request?.purpose"
            class="block text-gray-500 dark:text-gray-400 mt-0.5"
          >
            Purpose: {{ props.grant.source_access_request.purpose }}
          </span>
        </template>
        <template v-else-if="props.grant.creation_type === 'MANUAL'">
          Granted manually by
          {{ props.grant.issuing_authority?.name ?? "(unknown)" }}
        </template>
        <template v-else-if="props.grant.creation_type === 'SYSTEM_BOOTSTRAP'">
          System-issued on setup
        </template>
      </span>
    </div>

    <!-- Preset -->
    <div v-if="props.grant.source_preset" class="flex gap-2 text-xs">
      <span
        class="w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400"
      >
        Preset
      </span>
      <span class="text-gray-700 dark:text-gray-300">
        Issued as part of '{{ props.grant.source_preset.name }}'
      </span>
    </div>

    <!-- Authority (non-AR grants) -->
    <div
      v-if="
        props.grant.issuing_authority &&
        props.grant.creation_type !== 'ACCESS_REQUEST'
      "
      class="flex gap-2 text-xs"
    >
      <span
        class="w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400"
      >
        Authority
      </span>
      <span class="text-gray-700 dark:text-gray-300">
        Granted under authority of {{ props.grant.issuing_authority.name }}
      </span>
    </div>

    <!-- Justification -->
    <div v-if="props.grant.justification" class="flex gap-2 text-xs">
      <span
        class="w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400"
      >
        Note
      </span>
      <span class="text-gray-700 dark:text-gray-300">
        {{ props.grant.justification }}
      </span>
    </div>

    <!-- Revoked -->
    <div v-if="props.grant.revoked_at !== null" class="flex gap-2 text-xs">
      <span
        class="w-[72px] flex-shrink-0 font-medium text-gray-500 dark:text-gray-400"
      >
        Revoked
      </span>
      <span class="text-gray-700 dark:text-gray-300">
        {{ datetime.date(props.grant.revoked_at) }}
        <template v-if="props.grant.revoking_authority?.name">
          by {{ props.grant.revoking_authority.name }}
        </template>
        <template v-if="props.grant.revocation_reason">
          · Reason: {{ props.grant.revocation_reason }}
        </template>
      </span>
    </div>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  grant: { type: Object, required: true },
  canNavigateToRequest: { type: Boolean, default: false },
});

const emit = defineEmits(["navigate-to-request"]);
</script>
