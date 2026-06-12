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
      <div class="w-full">
        <div class="flex items-center gap-3 mb-2">
          <div
            class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex-shrink-0"
          >
            <i-mdi-clipboard-check-outline class="text-2xl" />
          </div>
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Review Access Request
            </h2>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Submitted {{ submittedTimeAgo }} ·
              <va-chip size="small" :color="statusColor">
                {{ request?.status }}
              </va-chip>
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
      <div v-else class="min-h-[500px] grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Left panel: Form (2 cols) -->
        <div class="col-span-2 flex flex-col overflow-hidden">
          <ReviewRequestForm
            v-if="request && formState?.value"
            :request="request"
            :form-state="formState.value"
            @submit="submit"
            @cancel="hide"
          />
        </div>

        <!-- Right panel: Preview (1 col) -->
        <div
          class="col-span-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
        >
          <ReviewEffectiveGrantsPreview
            v-if="request && formState?.value"
            :request="request"
            :approved-items-payload="formState.value.approvedItemsPayload"
            :access-type-map="accessTypeMap"
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
        class="w-full flex items-center justify-between gap-4 border-t border-solid border-gray-200 dark:border-gray-600 pt-4"
      >
        <p class="text-xs text-gray-400 dark:text-gray-500">
          <strong>{{ formState?.value?.approvedCount }}</strong> approved,
          <strong>{{ formState?.value?.rejectedCount }}</strong> rejected
        </p>

        <div class="flex items-center justify-end gap-3">
          <VaButton preset="secondary" @click="hide">Cancel</VaButton>
          <VaButton
            :loading="submitting"
            :disabled="!formState?.value?.isSubmitEnabled || conflictError"
            @click="submit"
          >
            <i-mdi-check class="mr-1.5" />
            Submit Review
          </VaButton>
        </div>
      </div>
    </template>
  </VaModal>
</template>

<script setup>
import ErrorState from "@/components/utils/ErrorState.vue";
import ModernAlert from "@/components/utils/ModernAlert.vue";
import * as datetime from "@/services/datetime";
import accessRequestsService from "@/services/v2/access-requests";
import grantsService from "@/services/v2/grants";
import { computed, ref, watch } from "vue";
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

// Form state composable (will be initialized when request loads)
const formState = ref(null);

// Initialize formState with default structure
const initializeFormState = () => {
  if (request.value && !formState.value) {
    formState.value = useReviewRequestForm(
      request.value,
      accessTypes.value,
      presets.value,
    );
  }
};

// Computed: access type map for preview
const accessTypeMap = computed(() => {
  const map = {};
  accessTypes.value?.forEach((at) => {
    map[at.id] = at;
  });
  return map;
});

// Computed: status color
const statusColor = computed(() => {
  switch (request.value?.status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "UNDER_REVIEW":
      return "info";
    default:
      return "secondary";
  }
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
  if (!request.value?.resource_type) return;

  accessTypesLoading.value = true;
  accessTypesError.value = null;

  try {
    const response = await grantsService.listAccessTypes(
      request.value.resource_type,
    );
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
  if (!request.value?.resource_type) return;

  presetsLoading.value = true;
  presetsError.value = null;

  try {
    const response = await grantsService.listGrantPresets(
      request.value.resource_type,
    );
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

<style scoped>
/* Smooth fade/slide transitions for alerts */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* List transitions for items */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-move {
  transition: transform 0.3s ease;
}
</style>
