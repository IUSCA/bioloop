<template>
  <ModernCollapsible v-model:isExpanded="isExpanded" class="w-full">
    <template #header>
      <SubjectPanelHeader
        :subject="props.subject"
        :grants="props.grants"
        :access-type-map="props.accessTypeMap"
      />
    </template>

    <div class="flex flex-col gap-3">
      <!-- Loading State -->
      <div
        v-if="expandedLoading"
        class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2"
      >
        <i-mdi-loading class="animate-spin" />
        <span>Loading grant details…</span>
      </div>

      <!-- Error State -->
      <ErrorState
        v-else-if="expandedError"
        title="Failed to load grant details"
        :message="expandedError?.message"
        @retry="fetchExpandedGrants"
      />

      <template v-else-if="expandedGrants">
        <!-- Group Access Note -->
        <p
          v-if="props.subject.type === 'GROUP'"
          class="text-xs text-gray-600 dark:text-gray-400 mb-1"
        >
          All effective members of this group — including members of subgroups —
          have the access listed below.
        </p>

        <!-- Grant Rows -->
        <GrantRow
          v-for="grant in sortedExpandedGrants"
          :key="grant.id"
          :grant="grant"
          :access-type-map="props.accessTypeMap"
          :can-revoke="props.canRevoke"
          :can-navigate-to-request="true"
          @revoke="emit('revoke', { grant: $event, subject: props.subject })"
          @navigate-to-request="emit('navigate-to-request', $event)"
        />

        <!-- Revoke All -->
        <div
          v-if="props.canRevoke && activeExpandedGrants.length > 1"
          class="flex justify-end pt-1"
        >
          <va-button
            color="danger"
            preset="plain"
            size="small"
            icon="remove_circle_outline"
            @click="
              emit('revoke-all', {
                grants: activeExpandedGrants,
                subject: props.subject,
                resourceType: props.resourceType,
                resourceId: props.resourceId,
              })
            "
          >
            Revoke All
          </va-button>
        </div>
      </template>
    </div>
  </ModernCollapsible>
</template>

<script setup>
import ErrorState from "@/components/utils/ErrorState.vue";
import ModernCollapsible from "@/components/utils/ModernCollapsible.vue";
import GrantService from "@/services/v2/grants";
import GrantRow from "./GrantRow.vue";
import SubjectPanelHeader from "./SubjectPanelHeader.vue";

const props = defineProps({
  /** Subject information: id, type, and optional user/group details */
  subject: {
    type: Object,
    required: true,
    // shape: { id, type: "USER"|"GROUP", user?: {...}, group?: {...} }
  },
  /** Array of grants for this subject */
  grants: {
    type: Array,
    required: true,
    // shape: [...]
  },
  /** id → AccessType lookup */
  accessTypeMap: {
    type: Object,
    required: true,
  },
  resourceType: {
    type: String,
    required: true,
    // "DATASET" | "COLLECTION"
  },
  resourceId: {
    type: String,
    required: true,
  },
  canRevoke: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["revoke", "revoke-all", "navigate-to-request"]);

// ── Internal state ──────────────────────────────────────────────────────────

const isExpanded = ref(false);
const expandedGrants = ref(null);
const expandedLoading = ref(false);
const expandedError = ref(null);

// ── Expanded grants (sorted: active first, revoked last) ─────────────────────

const activeExpandedGrants = computed(() =>
  expandedGrants.value
    ? expandedGrants.value.filter((g) => g.revoked_at === null)
    : [],
);

const sortedExpandedGrants = computed(() => {
  if (!expandedGrants.value) return [];
  const revoked = expandedGrants.value.filter((g) => g.revoked_at !== null);
  return [...activeExpandedGrants.value, ...revoked];
});

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchExpandedGrants() {
  expandedLoading.value = true;
  expandedError.value = null;
  try {
    const res = await GrantService.getGrantsForSubject(
      props.subject.type,
      props.subject.id,
      props.resourceType,
      props.resourceId,
    );
    expandedGrants.value = res.data;
  } catch (err) {
    expandedError.value = err;
  } finally {
    expandedLoading.value = false;
  }
}

watch(
  () => isExpanded.value,
  (expanded) => {
    if (expanded && expandedGrants.value === null) {
      fetchExpandedGrants();
    }
  },
);

// Reset cached expanded data when parent's grants list changes (e.g. after revoke)
watch(
  () => props.grants?.length,
  (newLen, oldLen) => {
    if (newLen !== oldLen) {
      expandedGrants.value = null;
    }
  },
);
</script>
