<template>
  <VaCard>
    <VaCardContent>
      <div class="min-h-[350px]">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-lg font-semibold">Your Access</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Why you can see this {{ noun }}.
          </p>
        </div>

        <div v-if="loading"></div>

        <div v-else-if="error" class="py-12 px-6">
          <ErrorState
            title="Failed to load your access"
            :error="error"
            subject="your access"
            @retry="fetchCoverage"
          />
        </div>

        <ul v-else-if="rows.length || structural.length" class="mt-4 space-y-3">
          <li
            v-for="path in structural"
            :key="path.key"
            class="flex items-start gap-3"
          >
            <i-mdi-shield-account-outline
              class="mt-0.5 shrink-0 text-lg va-text-secondary"
            />
            <p class="text-sm font-medium">{{ path.text }}</p>
          </li>
          <li v-for="row in rows" :key="row.id" class="flex items-start gap-3">
            <i-mdi-key-outline
              class="mt-0.5 shrink-0 text-lg va-text-secondary"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {{ row.access_type_description || row.access_type_name }}
              </p>
              <p class="text-xs va-text-secondary">{{ grantedVia(row) }}</p>
              <p v-if="row.valid_until" class="text-xs va-text-secondary">
                Until {{ datetime.date(row.valid_until) }}
              </p>
            </div>
          </li>
        </ul>

        <div v-else class="py-12 px-6">
          <EmptyState
            icon="mdi-key-outline"
            title="No access reaches you"
            :message="`Nothing currently gives you access to this ${noun}.`"
            :show-clear-filters="false"
          />
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
/**
 * The Access tab a caller sees when they do not manage grants: every path in their standing,
 * then every grant that reaches them and the path each one arrives by. It never lists another
 * subject's grants.
 *
 * @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
 * @see docs/design/groups/access-model-verification-plan.md — Paths replace the first-match role
 */
import * as datetime from "@/services/datetime";
import GrantService from "@/services/v2/grants";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  /** DATASET or COLLECTION. */
  resourceType: {
    type: String,
    required: true,
    validator: (v) => ["DATASET", "COLLECTION"].includes(v),
  },
  /** A dataset's resource_id, or a collection's id. */
  resourceId: { type: String, required: true },
  /** `_meta.standing` from the detail route. Grant paths are listed from coverage instead. */
  standing: { type: Array, default: () => [] },
});

/** What each path that is not a grant says about the caller, in the reader's words. */
const PATH_TEXT = {
  platform_admin: () => "You are a platform admin",
  admin: () => "You administer the group that owns it",
  oversight: () =>
    "You oversee the group that owns it, through a parent group you administer",
  resource_rule: (path) =>
    path.rule === "profile_public"
      ? "Its profile is public"
      : "Its profile is visible to signed-in users",
};

const structural = computed(() =>
  props.standing
    .filter((path) => PATH_TEXT[path.kind])
    .map((path, index) => ({
      key: `${path.kind}-${path.group_id ?? path.rule ?? index}`,
      text: PATH_TEXT[path.kind](path),
    })),
);

const auth = useAuthStore();

const rows = ref([]);
const loading = ref(true);
const error = ref(null);

const noun = computed(() =>
  props.resourceType === "DATASET" ? "dataset" : "collection",
);

/**
 * The paths `getEffectiveCoverage` returns, in the reader's words. A grant on a collection
 * that holds this dataset also names the collection.
 */
function grantedVia(row) {
  let to;
  if (row.via === "DIRECT") {
    to = "Granted to you";
  } else if (row.via === "PRINCIPAL") {
    to = `Granted to ${row.via_group_name}, which includes every signed-in user`;
  } else {
    to = `Granted to ${row.via_group_name ?? "a group"}, a group you belong to`;
  }
  return row.via_collection_name
    ? `${to}, through the collection ${row.via_collection_name}`
    : to;
}

async function fetchCoverage() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await GrantService.getCoverageForSubject(
      "USER",
      auth.user.subject_id,
      props.resourceType,
      props.resourceId,
    );
    rows.value = data;
  } catch (err) {
    error.value = err;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetchCoverage);
</script>
