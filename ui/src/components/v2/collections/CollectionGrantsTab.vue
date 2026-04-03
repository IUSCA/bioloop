<template>
  <VaInnerLoading :loading="loading" icon="lock">
    <div class="flex flex-col gap-4 max-w-5xl mx-auto">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Access</h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            Manage grants for users and groups that can access this collection.
          </p>
        </div>

        <VaButton
          size="small"
          color="primary"
          icon="mdi-plus"
          @click="openIssueGrantModal"
          :disabled="!canIssueGrant"
        >
          Issue grant
        </VaButton>
      </div>

      <Transition name="fade-slide" mode="out-in">
        <div v-if="error" key="error" class="py-12 px-6">
          <ErrorState
            title="Failed to load grants"
            :message="error?.message"
            @retry="fetchGrants"
          />
        </div>

        <div
          v-else-if="!loading && grants.length === 0"
          key="empty"
          class="py-12 px-6"
        >
          <EmptyState
            title="No grants found"
            message="This collection currently has no active grants. Issue a grant to give access."
            @reset="fetchGrants"
          />
        </div>

        <div v-else key="table">
          <GrantTable
            :grants="grants"
            :can-revoke="canRevoke"
            v-model:sort-by="sortBy"
            v-model:sorting-order="sortOrder"
            @revoke="onRevokeGrant"
          />

          <Pagination
            class="mt-5 px-5"
            v-model:page="currentPage"
            v-model:page_size="itemsPerPage"
            :total_results="total"
            :curr_items="grants.length"
          />
        </div>
      </Transition>
    </div>
  </VaInnerLoading>

  <IssueGrantModal
    ref="issueGrantModal"
    @update="onGrantCreated"
    :resource="collectionResource"
  />
</template>

<script setup>
import toast from "@/services/toast";
import GrantService from "@/services/v2/grants";

const props = defineProps({
  collection: { type: Object, required: true },
  canManageGrants: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const loading = ref(true);
const error = ref(null);
const grants = ref([]);
const total = ref(0);

const currentPage = ref(1);
const itemsPerPage = ref(20);
const sortBy = ref("created_at");
const sortOrder = ref("desc");

const canIssueGrant = computed(() => props.canManageGrants);
const canRevoke = computed(() => props.canManageGrants);
const collectionResource = computed(() => ({
  type: "COLLECTION",
  id: props.collection.id,
  collection: props.collection,
}));

const issueGrantModal = ref(null);

async function fetchGrants() {
  loading.value = true;
  error.value = null;

  try {
    const offset = (currentPage.value - 1) * itemsPerPage.value;
    const res = await GrantService.listGrantsForCollection(
      props.collection.id,
      {
        active: true,
        offset,
        limit: itemsPerPage.value,
        sort_by: sortBy.value,
        sort_order: sortOrder.value,
      },
    );

    grants.value = res.data?.data || [];
    total.value = res.data?.metadata?.total ?? 0;
    emit("count-changed", total.value);
  } catch (err) {
    console.error("Failed to load grants:", err);
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function onRevokeGrant(grant) {
  try {
    await GrantService.revoke(grant.id);
    toast.success("Grant revoked.");
    fetchGrants();
  } catch (err) {
    console.error("Failed to revoke grant:", err);
    toast.error(err?.response?.data?.message ?? "Failed to revoke grant.");
  }
}

function openIssueGrantModal() {
  issueGrantModal.value?.show?.();
}

function onGrantCreated() {
  fetchGrants();
}

watch([currentPage, itemsPerPage, sortBy, sortOrder], fetchGrants);

onMounted(() => fetchGrants());

defineExpose({ openIssueGrantModal });
</script>
