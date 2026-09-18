<template>
  <VaModal
    v-model="visible"
    hide-default-actions
    @cancel="hide"
    size="large"
    close-button
    no-outside-dismiss
    class="review-request-modal"
    title=""
  >
    <template #header>
      <div class="flex items-start gap-3 pr-8">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        >
          <i-mdi-clipboard-check-outline class="text-2xl" />
        </div>
        <div class="min-w-0">
          <h2 class="text-xl font-semibold">Review access request</h2>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge :color="statusTone">{{ statusLabel }}</Badge>
            <span class="text-sm va-text-secondary">
              {{ resourceName }} · submitted {{ submittedTimeAgo }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal content -->
    <VaInnerLoading
      :loading="loadingRequest || accessTypesLoading || presetsLoading"
    >
      <!-- Error state -->
      <ErrorState
        v-if="requestError || accessTypesError || presetsError"
        :message="requestError || accessTypesError || presetsError"
        @retry="loadRequestData"
      />

      <!-- Main content -->
      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div class="min-w-0 lg:col-span-3">
          <ReviewRequestForm
            v-if="request && formState"
            :request="request"
            :form-state="formState"
            :resource-type="resourceType"
            :subject-type="subjectType"
            @submit="submit"
            @cancel="hide"
          />
        </div>

        <!-- The preview follows the decisions, so it stays in view while the left column
             scrolls rather than sitting in a panel the reader has scrolled past. -->
        <div class="min-w-0 self-start lg:sticky lg:top-0 lg:col-span-2">
          <ReviewEffectiveGrantsPreview
            v-if="request && formState"
            :request="request"
            :resource-type="resourceType"
            :approved-items-payload="formState.approvedItemsPayload"
            :access-type-map="accessTypeMap"
          />

          <!-- How far the approved access reaches, directly under what it will be. -->
          <GrantScopeMessage
            v-if="subjectType && resourceType"
            class="mt-4"
            :subject-type="subjectType"
            :resource-type="resourceType"
          />
        </div>
      </div>

      <!-- Conflict/409 alert -->
      <Transition name="fade-slide">
        <ModernAlert v-if="conflictError" color="danger" class="mt-4">
          <template #title>Request Status Changed</template>
          This request has already been reviewed or withdrawn. Click below to
          reload and see the latest status.
          <template #actions>
            <VaButton size="small" preset="secondary" @click="loadRequestData">
              Reload Request
            </VaButton>
          </template>
        </ModernAlert>
      </Transition>
    </VaInnerLoading>

    <!-- Footer -->
    <template #footer>
      <div
        class="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-solid border-gray-200 pt-4 dark:border-gray-600"
      >
        <div class="min-w-0">
          <p class="text-sm">
            <span class="font-semibold text-emerald-700 dark:text-emerald-400">
              {{ formState?.approvedCount ?? 0 }} approved
            </span>
            <span class="va-text-secondary"> · </span>
            <span class="font-semibold text-red-700 dark:text-red-400">
              {{ formState?.rejectedCount ?? 0 }} rejected
            </span>
            <template v-if="undecidedCount">
              <span class="va-text-secondary"> · </span>
              <span class="va-text-secondary">
                {{ undecidedCount }} undecided
              </span>
            </template>
          </p>
          <!-- Beside the button it blocks, rather than in a banner further up the form. -->
          <p
            v-if="formState?.submitDisableReason"
            class="mt-0.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <i-mdi-alert-circle-outline class="shrink-0" />
            {{ formState.submitDisableReason }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <VaButton preset="secondary" @click="hide">Cancel</VaButton>
          <VaButton
            :loading="submitting"
            :disabled="!formState?.isSubmitEnabled || conflictError"
            @click="submit"
          >
            <i-mdi-check class="mr-1.5" />
            Submit review
          </VaButton>
        </div>
      </div>
    </template>
  </VaModal>
</template>

<script setup>
import ErrorState from "@/components/utils/ErrorState.vue";
import ModernAlert from "@/components/utils/ModernAlert.vue";
import Badge from "@/components/v2/Badge.vue";
import GrantScopeMessage from "@/components/v2/grants/issue/GrantScopeMessage.vue";
import * as datetime from "@/services/datetime";
import accessRequestsService from "@/services/v2/access-requests";
import grantsService from "@/services/v2/grants";
import { computed, ref, shallowRef, watch } from "vue";
import ReviewEffectiveGrantsPreview from "./ReviewEffectiveGrantsPreview.vue";
import ReviewRequestForm from "./ReviewRequestForm.vue";
import { useReviewRequestForm } from "./useReviewRequestForm";

const props = defineProps({
  requestId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["reviewed"]);

// Visibility control
const visible = ref(false);

// Loading states
const loadingRequest = ref(false);
const accessTypesLoading = ref(false);
const presetsLoading = ref(false);
const submitting = ref(false);

// Error states
const requestError = ref(null);
const accessTypesError = ref(null);
const presetsError = ref(null);
const conflictError = ref(null);

// Data
const request = ref(null);
const accessTypes = ref([]);
const presets = ref([]);

// The composable returns a reactive object; a shallowRef holds it without re-wrapping it.
const formState = shallowRef(null);

// Initialize formState with default structure
const initializeFormState = () => {
  if (request.value && !formState.value) {
    formState.value = useReviewRequestForm(request.value);
  }
};

// The API returns the resource as a row with its own `type`; there is no flat
// `resource_type` on a request. Four readers assumed there was, so it is derived once here
// and passed down.
const resourceType = computed(() => request.value?.resource?.type ?? null);
const subjectType = computed(() => request.value?.subject?.type ?? null);

// Computed: access type map for preview
const accessTypeMap = computed(() => {
  const map = {};
  accessTypes.value?.forEach((at) => {
    map[at.id] = at;
  });
  return map;
});

// The same map the request list and the detail page use, so one status is one colour
// everywhere. An unmapped status falls to neutral rather than to a colour that means
// something.
const STATUS_TONE = {
  DRAFT: "neutral",
  UNDER_REVIEW: "primary",
  APPROVED: "success",
  PARTIALLY_APPROVED: "warning",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
};

const statusTone = computed(
  () => STATUS_TONE[request.value?.status] ?? "neutral",
);

// "UNDER_REVIEW" is a database value. The header shows "UNDER REVIEW".
const statusLabel = computed(() =>
  (request.value?.status || "").replaceAll("_", " "),
);

const resourceName = computed(() => {
  const resource = request.value?.resource;
  return (
    resource?.dataset?.name || resource?.collection?.name || "Access request"
  );
});

const undecidedCount = computed(() => {
  const total = request.value?.access_request_items?.length ?? 0;
  const decided =
    (formState.value?.approvedCount ?? 0) +
    (formState.value?.rejectedCount ?? 0);
  return Math.max(total - decided, 0);
});

// Computed: submitted time ago
const submittedTimeAgo = computed(() => {
  if (!request.value?.created_at) return "";
  return datetime.fromNow(request.value.created_at, false);
});

// Load request data from API
const loadRequestData = async () => {
  loadingRequest.value = true;
  requestError.value = null;
  conflictError.value = null;

  try {
    const response = await accessRequestsService.get(props.requestId);
    request.value = response.data;
    initializeFormState();
  } catch (err) {
    console.error("Failed to load request:", err);
    requestError.value =
      err.response?.data?.message || "Failed to load request";
  } finally {
    loadingRequest.value = false;
  }
};

// Load access types
const loadAccessTypes = async () => {
  if (!resourceType.value) return;

  accessTypesLoading.value = true;
  accessTypesError.value = null;

  try {
    const response = await grantsService.listAccessTypes(resourceType.value);
    accessTypes.value = response.data || [];
  } catch (err) {
    console.error("Failed to load access types:", err);
    accessTypesError.value = "Failed to load access types";
  } finally {
    accessTypesLoading.value = false;
  }
};

// Load presets
const loadPresets = async () => {
  if (!resourceType.value) return;

  presetsLoading.value = true;
  presetsError.value = null;

  try {
    const response = await grantsService.listGrantPresets(resourceType.value);
    presets.value = response.data || [];
  } catch (err) {
    console.error("Failed to load presets:", err);
    presetsError.value = "Failed to load presets";
  } finally {
    presetsLoading.value = false;
  }
};

// Submit review
const submit = async () => {
  if (!formState.value || !formState.value.isSubmitEnabled) return;

  submitting.value = true;
  conflictError.value = null;

  try {
    await formState.value.submit(props.requestId);
    emit("reviewed");
    hide();
  } catch (err) {
    console.error("Failed to submit review:", err);
    if (err.response?.status === 409) {
      conflictError.value = true;
    } else {
      requestError.value =
        err.response?.data?.message || "Failed to submit review";
    }
  } finally {
    submitting.value = false;
  }
};

// Modal control
const show = async () => {
  visible.value = true;
  // A second open must not inherit the previous review's decisions.
  formState.value = null;
  await loadRequestData();
  await Promise.all([loadAccessTypes(), loadPresets()]);
};

const hide = () => {
  visible.value = false;
};

// Watch request changes and update form state
watch(
  () => request.value,
  () => {
    initializeFormState();
  },
);

// Expose control methods
defineExpose({ show, hide });
</script>
