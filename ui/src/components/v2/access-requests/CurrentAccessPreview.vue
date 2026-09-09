<template>
  <div class="sticky top-4">
    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">Current Access</h3>

      <!-- Not selected state -->
      <div
        v-if="!props.subject"
        class="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
      >
        <Icon
          icon="mdi-information-outline"
          class="text-2xl text-gray-400 dark:text-gray-500"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
          Select a subject to see their current access.
        </p>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="space-y-2">
        <div
          class="h-12 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        />
        <div
          class="h-12 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        />
      </div>

      <!-- Error state -->
      <ErrorState
        v-else-if="error"
        :message="error"
        @retry="loadGrants"
        :show-button-text="true"
      />

      <!-- Empty state -->
      <EmptyState
        v-else-if="grants.length === 0"
        icon="mdi-lock-outline"
        title="No active grants"
        message="Nothing reaches this subject on this resource, by any path."
        :show-clear-filters="false"
      />

      <!-- Grants list -->
      <div v-else class="space-y-2">
        <div
          v-for="grant in grants"
          :key="grant.id"
          class="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-gray-800/50 border border-solid border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
        >
          <div
            class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-sm"
          >
            <i-mdi-check-circle class="text-base" />
          </div>
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
            >
              {{ getAccessTypeName(grant) }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatExpiry(grant.valid_until) }}
            </p>
            <!--
              A grant reaching the subject through a group or a collection is the case this
              panel used to hide, and it is the one worth naming: asking for access the
              subject already inherits is wasted effort on both sides.
            -->
            <p
              v-if="viaLabel(grant)"
              class="mt-0.5 text-xs text-amber-700 dark:text-amber-400"
            >
              {{ viaLabel(grant) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import grantService from "@/services/v2/grants";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const props = defineProps({
  subject: {
    type: Object,
    default: null,
  },
  resource: {
    type: Object,
    required: true,
  },
});

const grants = ref([]);
const loading = ref(false);
const error = ref(null);

/**
 * Load active grants for the subject on this resource
 */
async function loadGrants() {
  if (!props.subject?.id) {
    grants.value = [];
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    // Coverage, not direct grants. The exact-subject question hid access the subject
    // inherits from a group, which is the thing a requester most needs to know before asking.
    // @see docs/design/groups/access-requests-plan.md — C2
    const response = await grantService.getCoverageForSubject(
      props.subject.type,
      props.subject.id,
      props.resource.type,
      props.resource.id,
    );
    grants.value = response.data || [];
  } catch (err) {
    error.value =
      err?.response?.data?.message || "Failed to load active grants";
    grants.value = [];
  } finally {
    loading.value = false;
  }
}

/**
 * Format expiry date
 */
function formatExpiry(until) {
  if (!until) {
    return "Never expires";
  }
  const date = dayjs(until);
  const now = dayjs();
  if (date.isBefore(now)) {
    return "Expired";
  }
  return `Expires ${date.fromNow()}`;
}

/**
 * Get access type name from grant
 */
function getAccessTypeName(grant) {
  return grant.access_type_name || grant.access_type_id || "Unknown";
}

/**
 * How this grant reaches the subject, or null when the subject holds it itself.
 */
function viaLabel(grant) {
  const parts = [];
  if (grant.via === "GROUP" && grant.via_group_name) {
    parts.push(`via ${grant.via_group_name}`);
  } else if (grant.via === "PRINCIPAL") {
    parts.push("via a system principal");
  }
  if (grant.via_collection_name) {
    parts.push(`through the collection ${grant.via_collection_name}`);
  }
  return parts.length ? `Already held ${parts.join(", ")}` : null;
}

// Load on mount as well as on change. The dialog opens with a subject already chosen, so a
// watch alone never fired and the panel reported "no active grants" without having asked.
watch(
  () => props.subject?.id,
  () => {
    loadGrants();
  },
  { immediate: true },
);
</script>
