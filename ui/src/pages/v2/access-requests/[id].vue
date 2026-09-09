<template>
  <Transition name="fade-slide" mode="out-in">
    <!-- Loading -->
    <div v-if="loading" key="loading" class="flex flex-col gap-4">
      <VaSkeleton variant="text" height="32px" width="260px" />
      <VaSkeleton variant="squared" height="220px" />
      <VaSkeleton variant="squared" height="220px" />
    </div>

    <!-- Error -->
    <div v-else-if="error" key="error" class="py-12 px-6">
      <ErrorState
        title="Failed to load access request"
        :message="error?.message"
        @retry="fetchRequest"
      />
    </div>

    <!-- Loaded -->
    <div
      v-else-if="request"
      key="loaded"
      class="flex flex-col gap-4 max-w-4xl mx-auto"
    >
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3 mt-3">
        <div class="flex items-center gap-3">
          <i-mdi-account-question-outline
            class="text-2xl shrink-0"
            style="color: var(--va-primary)"
          />
          <h1 class="text-xl font-semibold">Access request</h1>
          <Badge :color="STATUS_TONE[request.status] || 'neutral'" size="base">
            {{ statusLabel }}
          </Badge>
        </div>

        <div class="flex items-center gap-2">
          <VaButton v-if="canReview" preset="primary" @click="openReviewModal">
            Review
          </VaButton>
          <VaButton
            v-if="canWithdraw"
            preset="secondary"
            color="danger"
            :loading="withdrawing"
            @click="withdraw"
          >
            Withdraw
          </VaButton>
        </div>
      </div>

      <!--
        What the decision actually produced. An APPROVED request whose grants were revoked
        reads as access the requester does not have, so the page says which.
        @see docs/design/groups/access-requests-plan.md — C4
      -->
      <VaCard v-if="summary && isDecided">
        <VaCardContent>
          <h2 class="text-lg font-semibold mb-3">Access from this request</h2>

          <div class="flex flex-wrap items-center gap-2 mb-2">
            <Badge :color="summary.live > 0 ? 'success' : 'danger'">
              {{ summary.live }} live
            </Badge>
            <Badge v-if="summary.revoked > 0" color="warning">
              {{ summary.revoked }} revoked
            </Badge>
            <Badge v-if="summary.expired > 0" color="neutral">
              {{ summary.expired }} expired
            </Badge>
          </div>

          <p v-if="summary.issued === 0" class="text-sm va-text-secondary">
            This request issued no grants.
          </p>
          <p
            v-else-if="summary.live === 0"
            class="text-sm text-red-700 dark:text-red-400"
          >
            Nothing from this request is in force any more.
            <span v-if="summary.last_revoked_at">
              The last grant was revoked
              {{ datetime.fromNowShort(summary.last_revoked_at)
              }}<template v-if="summary.last_revocation_type">
                ({{ summary.last_revocation_type.toLowerCase() }})</template
              >.
            </span>
          </p>

          <!-- Approved access the subject holds by some other path. -->
          <div v-if="summary.covered_elsewhere?.length" class="mt-3 space-y-1">
            <p
              class="text-xs font-semibold uppercase tracking-wider va-text-secondary"
            >
              Also reaching this subject
            </p>
            <p
              v-for="row in summary.covered_elsewhere"
              :key="row.id"
              class="text-sm va-text-secondary"
            >
              {{ row.access_type_name }} — {{ coverageVia(row) }}
            </p>
          </div>
        </VaCardContent>
      </VaCard>

      <!-- Who, what, and why -->
      <VaCard>
        <VaCardContent>
          <RequestContextHeader :request="request" />
        </VaCardContent>
      </VaCard>

      <!-- What was asked for, and what was decided -->
      <VaCard>
        <VaCardContent>
          <h2 class="text-lg font-semibold mb-3">Requested access</h2>

          <div class="space-y-3">
            <div
              v-for="item in request.access_request_items"
              :key="item.id"
              class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 p-3"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ itemName(item) }}</p>
                  <p
                    v-if="itemDescription(item)"
                    class="text-sm va-text-secondary mt-0.5"
                  >
                    {{ itemDescription(item) }}
                  </p>

                  <!-- A preset is a named bundle; name what it covers. -->
                  <div
                    v-if="presetAccessTypes(item).length"
                    class="mt-2 flex flex-wrap gap-1"
                  >
                    <Badge
                      v-for="accessType in presetAccessTypes(item)"
                      :key="accessType.id"
                      color="neutral"
                    >
                      {{ accessType.name }}
                    </Badge>
                  </div>
                </div>

                <div class="text-right shrink-0">
                  <Badge :color="DECISION_TONE[item.decision] || 'neutral'">
                    {{ (item.decision || "PENDING").replaceAll("_", " ") }}
                  </Badge>
                  <p class="text-xs va-text-secondary mt-1">
                    {{ expiryLabel(item) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- The reviewer's own words, which the item decisions do not carry. -->
          <div v-if="request.decision_reason" class="mt-4">
            <p
              class="text-xs font-semibold uppercase tracking-wider va-text-secondary"
            >
              Reviewer's note
            </p>
            <p class="text-sm mt-1">{{ request.decision_reason }}</p>
          </div>
        </VaCardContent>
      </VaCard>
    </div>
  </Transition>

  <ReviewRequestModal
    v-if="reviewingId"
    ref="reviewModal"
    :request-id="reviewingId"
    @reviewed="onReviewed"
  />
</template>

<script setup>
/**
 * The one page that renders a single access request.
 *
 * Nothing rendered one before: the queue's `viewRequest` pushed to a legacy path that does
 * not exist, so every card in every list was a 404. This is the surface a notification links
 * to, and where the effective-access summary sits.
 *
 * @see docs/design/groups/access-requests-plan.md — B3
 */
import Badge from "@/components/v2/Badge.vue";
import RequestContextHeader from "@/components/v2/access-requests/RequestContextHeader.vue";
import ReviewRequestModal from "@/components/v2/access-requests/ReviewRequestModal.vue";
import AccessRequestService from "@/services/v2/access-requests";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useNavStore } from "@/stores/nav";
import { useAuthStore } from "@/stores/auth";

// The file-based router passes the path parameter as a prop; declaring it also stops it
// falling through as an attribute onto this page's fragment root.
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
});

const nav = useNavStore();
const auth = useAuthStore();

const request = ref(null);
const loading = ref(true);
const error = ref(null);
const withdrawing = ref(false);

// The modal is mounted only once a review starts, so a page that nobody reviews from does
// not pay for the modal's three fetches. `show()` reloads the request each time it opens.
const reviewModal = ref(null);
const reviewingId = ref(null);

const STATUS_TONE = {
  DRAFT: "neutral",
  UNDER_REVIEW: "primary",
  APPROVED: "success",
  PARTIALLY_APPROVED: "warning",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
};

const DECISION_TONE = {
  PENDING: "neutral",
  APPROVED: "success",
  REJECTED: "danger",
};

const requestId = computed(() => props.id);

const statusLabel = computed(() =>
  (request.value?.status || "").replaceAll("_", " "),
);

const capabilities = computed(
  () => new Set(request.value?._meta?.capabilities ?? []),
);

const canReview = computed(
  () =>
    capabilities.value.has("review") &&
    request.value?.status === "UNDER_REVIEW",
);

const summary = computed(() => request.value?.access_summary ?? null);

const isDecided = computed(() =>
  ["APPROVED", "PARTIALLY_APPROVED", "REJECTED"].includes(
    request.value?.status,
  ),
);

// The same three paths `getEffectiveCoverage` labels, in the reader's words.
function coverageVia(row) {
  if (row.via_collection_name) {
    return `held through the collection ${row.via_collection_name}`;
  }
  if (row.via === "PRINCIPAL") return "held via a system principal";
  if (row.via_group_name) return `held through ${row.via_group_name}`;
  if (row.via === "GROUP") return "held through a group";
  return "held directly";
}

const canWithdraw = computed(
  () =>
    request.value?.requester_id === auth.user?.subject_id &&
    ["DRAFT", "UNDER_REVIEW"].includes(request.value?.status),
);

function itemName(item) {
  return (
    item.preset?.name ||
    item.access_type?.name ||
    `Access type ${item.access_type_id}`
  );
}

function itemDescription(item) {
  return item.preset?.description || item.access_type?.description || "";
}

// A preset's access types arrive as join rows, each carrying the access type itself.
function presetAccessTypes(item) {
  return (item.preset?.access_type_items ?? [])
    .map((joinRow) => joinRow.access_type)
    .filter(Boolean);
}

// `approved_until` is what the reviewer settled on; `requested_until` is what was asked
// for. Both are null when the ask was "never expires".
function expiryLabel(item) {
  if (item.decision === "APPROVED") {
    return item.approved_until
      ? `Until ${datetime.date(item.approved_until)}`
      : "No end date";
  }
  return item.requested_until
    ? `Asked until ${datetime.date(item.requested_until)}`
    : "Asked with no end date";
}

async function fetchRequest() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await AccessRequestService.get(requestId.value);
    request.value = data;
    nav.setNavItems([
      { label: "Access Requests", to: "/v2/access-requests" },
      { label: "Request" },
    ]);
  } catch (err) {
    error.value = err;
    request.value = null;
  } finally {
    loading.value = false;
  }
}

function openReviewModal() {
  reviewingId.value = requestId.value;
  nextTick(() => reviewModal.value?.show?.());
}

function onReviewed() {
  reviewingId.value = null;
  fetchRequest();
}

async function withdraw() {
  withdrawing.value = true;
  try {
    await AccessRequestService.withdraw(requestId.value);
    toast.success("Request withdrawn");
    await fetchRequest();
  } catch (err) {
    toast.error(err?.response?.data?.message || "Failed to withdraw request");
  } finally {
    withdrawing.value = false;
  }
}

watch(requestId, fetchRequest);

onMounted(fetchRequest);
</script>

<route lang="yaml">
meta:
  title: Access Request
</route>
