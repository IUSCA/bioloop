<template>
  <div class="flex flex-col gap-3 max-w-7xl mx-auto">
    <!-- Header row -->
    <VaCard class="header card">
      <VaCardContent>
        <div class="flex items-start justify-between gap-3">
          <!-- <div>
              <h2 class="text-lg font-semibold">Access</h2>
              <p class="text-sm text-gray-600 dark:text-gray-300">
                Manage grants for users and groups that can access this
                collection.
              </p>
            </div> -->
          <div class="flex flex-col gap-2 flex-1">
            <div class="flex items-center justify-between gap-3">
              <!-- subject type selector -->
              <ModernButtonToggle
                v-model="subjectType"
                :options="subjectTypeOptions"
                value-by="value"
              />

              <!-- Search input -->
              <div class="flex-1">
                <Searchbar
                  v-model="subjectSearchTerm"
                  placeholder="Search grants by user or group name"
                />
              </div>
            </div>

            <!-- Implement later -->
            <!-- Access Type Dropdown and multiselect -->
            <!-- <div class="flex items-center gap-3">
              <div class="max-w-[256rem] text-sm">
                <VaSelect
                  v-model="selectedAccessTypes"
                  :options="accessTypes"
                  text-by="description"
                  value-by="id"
                  selected-top-shown
                  :max-visible-options="1"
                  :loading="accessTypesLoading"
                  :disabled="accessTypesError"
                  placeholder="Filter by Access Type"
                />
              </div>

              <div class="flex items-center gap-2 overflow-clip">
                <VaChip
                  v-for="at in accessTypes.filter((at) =>
                    selectedAccessTypes.includes(at.id),
                  )"
                  :key="at.id"
                  :label="at.description"
                  removable
                  @remove="
                    selectedAccessTypes = selectedAccessTypes.filter(
                      (id) => id !== at.id,
                    )
                  "
                />
              </div>
            </div> -->
          </div>

          <VaButton
            v-if="props.canManageGrants"
            color="success"
            icon="add"
            @click="openIssueGrantModal"
          >
            Issue Grants
          </VaButton>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- keeps layout stable when swapping views -->
    <VaCard class="min-h-[360px]">
      <VaCardContent>
        <Transition name="fade-slide" mode="out-in">
          <div v-if="error" key="error" class="py-12 px-6">
            <ErrorState
              title="Failed to load grants"
              :message="error?.message"
              @retry="fetchGrants"
            />
          </div>

          <div
            v-else-if="!loading && grantGroups.length === 0"
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
            <div class="flex flex-col gap-3">
              <div
                v-for="group in grantGroups"
                :key="group.subject.id"
                class="flex items-center w-full"
              >
                <GrantsBySubjectPanel
                  :subject="group.subject"
                  :grants="group.grants"
                  :access-type-map="accessTypeMap"
                  resource-type="COLLECTION"
                  :resource-id="props.collection.id"
                  :can-revoke="canRevoke"
                  @revoke="onRevokeGrant"
                />
              </div>
            </div>
            <!-- Pagination controls -->
            <div v-if="showPagination" class="mt-6 flex justify-center">
              <VaPagination
                v-model="currentPage"
                :pages="pages"
                :direction-links="true"
                :boundary-links="false"
                :direction-icon-left="'va-arrow-left'"
                :direction-icon-right="'va-arrow-right'"
              />
            </div>
          </div>
        </Transition>
      </VaCardContent>
    </VaCard>
  </div>

  <IssueGrantModal
    ref="issueGrantModal"
    @update="onGrantCreated"
    :resource="collectionResource"
  />
</template>

<script setup>
import { useAccessTypes } from "@/components/v2/grants/issue/useAccessTypes";
import toast from "@/services/toast";
import GrantService from "@/services/v2/grants";

const props = defineProps({
  collection: { type: Object, required: true },
  canManageGrants: { type: Boolean, default: false },
});

// const emit = defineEmits(["count-changed"]);

const loading = ref(true);
const error = ref(null);
const grantGroups = ref([]);
const total = ref(0);

const currentPage = ref(1);
const itemsPerPage = ref(10);
const sortBy = ref("created_at");
const sortOrder = ref("desc");

const subjectSearchTerm = ref("");
const subjectType = ref("");
const selectedAccessTypes = ref([]);

const {
  accessTypes,
  // loading: accessTypesLoading,
  // error: accessTypesError,
  // refresh: refreshAccessTypes,
} = useAccessTypes("COLLECTION");

const canRevoke = computed(() => props.canManageGrants);
const collectionResource = computed(() => ({
  type: "COLLECTION",
  id: props.collection.id,
  collection: props.collection,
}));
const accessTypeMap = computed(() => {
  const map = {};
  accessTypes.value.forEach((at) => (map[at.id] = at));
  return map;
});

const subjectTypeOptions = [
  { label: "Any", value: "" },
  { label: "User", value: "USER" },
  { label: "Group", value: "GROUP" },
];

const issueGrantModal = ref(null);

// Pagination: detect if there's a next page by checking if we got fewer results than requested
const hasNextPage = computed(
  () => grantGroups.value.length === itemsPerPage.value,
);
const pages = computed(() => {
  // If we're on page 1 and have results equal to page size, there might be a next page
  // If we got fewer results than page size, we're on the last page
  return hasNextPage.value ? currentPage.value + 1 : currentPage.value;
});
const showPagination = computed(
  () => currentPage.value > 1 || hasNextPage.value,
);

async function fetchGrants() {
  loading.value = true;
  error.value = null;

  try {
    const offset = (currentPage.value - 1) * itemsPerPage.value;

    const params = {
      limit: itemsPerPage.value,
      offset,

      // sort_by: sortBy.value,
      // sort_order: sortOrder.value,
    };
    if (subjectSearchTerm.value && subjectSearchTerm.value.trim() !== "") {
      params.subject_search_term = subjectSearchTerm.value;
    }
    if (subjectType.value) {
      params.subject_type = subjectType.value;
    }
    if (selectedAccessTypes.value.length > 0) {
      params.access_type_ids = selectedAccessTypes.value;
    }

    const res = await GrantService.listGrantsForCollection(
      props.collection.id,
      params,
    );

    grantGroups.value = res.data || [];
    total.value = res.data?.metadata?.total ?? 0;
    // emit("count-changed", total.value);
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

watch([subjectSearchTerm, subjectType, selectedAccessTypes], () => {
  currentPage.value = 1; // Reset to first page on filter change
  fetchGrants();
});

watch([currentPage, itemsPerPage, sortBy, sortOrder], fetchGrants);

onMounted(() => fetchGrants());

defineExpose({ openIssueGrantModal });
</script>
