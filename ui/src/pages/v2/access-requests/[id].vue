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
        :error="error"
        subject="this access request"
        @retry="fetchRequest"
      />
    </div>

    <!-- Loaded -->
    <div v-else-if="request" key="loaded">
      <!-- Page header. The <h1> names the resource, as it does on every other v2 detail
           page; "Access request" is the breadcrumb's job and the summary line's. -->
      <div class="mt-3 flex items-start justify-between flex-wrap gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <i-mdi-account-question-outline
            class="text-2xl shrink-0 mt-0.5"
            style="color: var(--va-primary)"
          />
          <div class="min-w-0">
            <div class="flex items-center flex-wrap gap-2.5">
              <h1 class="text-xl font-semibold truncate">{{ resourceName }}</h1>
              <Badge
                :color="STATUS_TONE[request.status] || 'neutral'"
                size="base"
              >
                {{ statusLabel }}
              </Badge>
            </div>
            <p class="text-sm va-text-secondary">{{ summaryLine }}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Filled, like the one page-level action on every other v2 page. Vuestic's
               `primary` preset is the tinted variant and reads as a secondary control. -->
          <VaButton v-if="canReview" @click="openReviewModal">
            Review request
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

      <div
        class="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-4"
      >
        <!-- What was asked for, and why -->
        <div class="flex flex-col gap-4 min-w-0">
          <RequestedAccessCard
            :items="request.access_request_items ?? []"
            :decision-reason="request.decision_reason || ''"
          />

          <VaCard>
            <VaCardContent class="!p-4">
              <h2 class="v2-card-title">Purpose</h2>
              <p v-if="request.purpose" class="mt-2 text-sm">
                {{ request.purpose }}
              </p>
              <p v-else class="mt-2 text-sm italic va-text-secondary">
                No purpose provided
              </p>
            </VaCardContent>
          </VaCard>
        </div>

        <!-- The rail: what the request produced, what else reaches the subject, and who
             asked for what. -->
        <div class="flex flex-col gap-4 min-w-0">
          <RequestOutcomeCard v-if="summary && isDecided" :summary="summary" />
          <SubjectCoverageCard
            v-if="summary?.covered_elsewhere?.length"
            :rows="summary.covered_elsewhere"
            :decided="isDecided"
          />
          <RequestDetailsCard :request="request" />
        </div>
      </div>
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
 * Two columns: what was asked for on the left, and what it means for the subject on the
 * right. The rail leads with the outcome, because a decided request is read to find out
 * what access is in force right now, and the status badge alone answers that wrongly
 * whenever a grant has since been revoked.
 *
 * @see docs/design/groups/implementation/access-requests-plan.md — B3, C4
 * @see docs/public/mockups/access-request-screens.html
 */
import Badge from "@/components/v2/Badge.vue";
import RequestDetailsCard from "@/components/v2/access-requests/RequestDetailsCard.vue";
import RequestOutcomeCard from "@/components/v2/access-requests/RequestOutcomeCard.vue";
import RequestedAccessCard from "@/components/v2/access-requests/RequestedAccessCard.vue";
import ReviewRequestModal from "@/components/v2/access-requests/ReviewRequestModal.vue";
import SubjectCoverageCard from "@/components/v2/access-requests/SubjectCoverageCard.vue";
import AccessRequestService from "@/services/v2/access-requests";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useNavStore } from "@/stores/nav";

// The file-based router passes the path parameter as a prop; declaring it also stops it
// falling through as an attribute onto this page's fragment root.
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
});

const nav = useNavStore();

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

const requestId = computed(() => props.id);

const statusLabel = computed(() =>
  (request.value?.status || "").replaceAll("_", " "),
);

const resourceName = computed(() => {
  const resource = request.value?.resource;
  return (
    resource?.dataset?.name || resource?.collection?.name || "Access request"
  );
});

const capabilities = computed(
  () => new Set(request.value?._meta?.capabilities ?? []),
);

// The transition table decides both: `review` only while under review, `withdraw` only for the
// requester and only before a decision.
const canReview = computed(() => capabilities.value.has("review"));
const canWithdraw = computed(() => capabilities.value.has("withdraw"));

const summary = computed(() => request.value?.access_summary ?? null);

const isDecided = computed(() =>
  ["APPROVED", "PARTIALLY_APPROVED", "REJECTED"].includes(
    request.value?.status,
  ),
);

// One line under the title saying what happened last and who did it. A decided request is
// described by its decision; an open one by its submission.
const summaryLine = computed(() => {
  const value = request.value;
  if (!value) return "";
  const requesterName = value.requester?.name || value.requester?.username;

  if (isDecided.value && value.reviewed_at) {
    const verb =
      {
        APPROVED: "approved",
        PARTIALLY_APPROVED: "reviewed",
        REJECTED: "rejected",
      }[value.status] || "reviewed";
    const reviewerName = value.reviewer?.name || value.reviewer?.username;
    const by = reviewerName ? ` by ${reviewerName}` : "";
    return `Access request · ${verb} ${datetime.fromNowShort(value.reviewed_at)}${by}`;
  }

  const at = value.submitted_at || value.created_at;
  const by = requesterName ? ` by ${requesterName}` : "";
  return `Access request · submitted ${datetime.fromNowShort(at)}${by}`;
});

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
