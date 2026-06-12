<template>
  <VaModal
    v-model="visible"
    hide-default-actions
    @cancel="hide"
    size="large"
    close-button
    no-outside-dismiss
  >
    <!-- Modal header -->
    <template #header>
      <div class="mb-3">
        <div class="flex items-center gap-3">
          <div
            class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          >
            <i-mdi-file-document-outline class="text-2xl" />
          </div>
          <div>
            <h2 class="text-xl font-semibold">
              {{ headerTitle }}
            </h2>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {{ headerSubtitle }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal footer -->
    <template #footer>
      <div
        class="w-full flex items-center justify-between gap-4 border-t border-solid border-gray-200 dark:border-gray-600 pt-4"
      >
        <p class="text-xs text-gray-400 dark:text-gray-500">
          {{ draftStatusLabel }}
        </p>

        <div class="flex items-center justify-end gap-3">
          <VaButton preset="secondary" @click="hide">Cancel</VaButton>

          <!-- Show appropriate buttons based on step -->
          <template v-if="currentStep === 'picker'">
            <!-- No additional buttons for picker step -->
          </template>

          <template v-else-if="currentStep === 'form'">
            <VaButton
              preset="plain"
              :loading="formState.isSaving.value"
              :disabled="!formState.isFormValidForDraft.value"
              @click="saveDraft"
              color="secondary"
            >
              Save Draft
            </VaButton>

            <VaButton
              :loading="formState.isSubmitting.value"
              :disabled="
                !formState.isFormValidForSubmit.value ||
                formState.isSubmitting.value
              "
              @click="submitRequest"
            >
              <span>Submit for Review</span>
              <i-mdi-arrow-right class="ml-1 text-sm" />
            </VaButton>
          </template>
        </div>
      </div>
    </template>

    <!-- Modal content -->
    <VaInnerLoading :loading="loading || accessTypesLoading || presetsLoading">
      <ErrorState
        v-if="accessTypesError || presetsError"
        :message="accessTypesError || presetsError"
        @retry="
          fetchAccessTypes();
          fetchPresets();
        "
      />

      <!-- Picker step: Show existing drafts -->
      <div v-else-if="currentStep === 'picker'">
        <DraftRequestPicker
          v-if="drafts.length > 0"
          :drafts="drafts"
          @select="selectDraft"
          @create-new="createNewRequest"
        />

        <!-- No drafts found, proceed to form -->
        <div v-else class="text-center py-8">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            No existing drafts. Creating a new request…
          </p>
        </div>
      </div>

      <!-- Form step: Show request form -->
      <RequestAccessForm
        v-else-if="currentStep === 'form'"
        :resource="props.resource"
        :draft-id="selectedDraftId"
        :draft="selectedDraft"
        @saved="handleSaved"
      />
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import { useAccessTypes } from "@/components/v2/grants/issue/useAccessTypes";
import { useGrantPresets } from "@/components/v2/grants/issue/useGrantPresets";
import toast from "@/services/toast";
import { useAccessRequestDrafts } from "./useAccessRequestDrafts";
import { useRequestAccessForm } from "./useRequestAccessForm";

const props = defineProps({
  resource: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["submitted"]);

const visible = ref(false);
const loading = ref(false);
const currentStep = ref("picker"); // 'picker' | 'form'
const selectedDraftId = ref(null);

// Get draft list
const {
  drafts,
  // loading: draftsLoading,
  // error: draftsError,
} = useAccessRequestDrafts(computed(() => props.resource?.id));

// Get access types and presets
const {
  // accessTypes,
  loading: accessTypesLoading,
  error: accessTypesError,
  fetch: fetchAccessTypes,
} = useAccessTypes(computed(() => props.resource?.type));

const {
  // presets,
  loading: presetsLoading,
  error: presetsError,
  fetch: fetchPresets,
} = useGrantPresets(computed(() => props.resource?.type));

// Form state
const formState = useRequestAccessForm({
  resource: props.resource,
  initialDraftId: null,
});

// Computed: Get selected draft from list
const selectedDraft = computed(() => {
  return drafts.value.find((d) => d.id === selectedDraftId.value);
});

// Computed: Header text
const headerTitle = computed(() => {
  if (currentStep.value === "picker") {
    return "Request Access";
  }
  return selectedDraftId.value ? "Edit Draft Request" : "Request Access";
});

const headerSubtitle = computed(() => {
  if (currentStep.value === "picker") {
    return "Choose a draft to continue or start fresh.";
  }
  return "Submit a formal access request for review.";
});

// Computed: Draft status label
const draftStatusLabel = computed(() => {
  if (!selectedDraftId.value) {
    return "New request";
  }
  if (selectedDraft.value?.updated_at) {
    const date = new Date(selectedDraft.value.updated_at);
    const formatted =
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `Draft saved on ${formatted}`;
  }
  return "Draft";
});

/**
 * Show modal
 */
function show() {
  visible.value = true;
  loading.value = true;

  // Determine which step to show
  setTimeout(() => {
    if (drafts.value && drafts.value.length > 0) {
      currentStep.value = "picker";
    } else {
      // No drafts, go straight to form
      currentStep.value = "form";
      formState.reset();
    }
    loading.value = false;
  }, 500);
}

/**
 * Hide modal
 */
function hide() {
  visible.value = false;
}

/**
 * Select a draft and go to form
 */
function selectDraft(draftId) {
  selectedDraftId.value = draftId;
  formState.reset();
  formState.loadDraft(selectedDraft.value);
  currentStep.value = "form";
}

/**
 * Create a new request (without draft)
 */
function createNewRequest() {
  selectedDraftId.value = null;
  formState.reset();
  currentStep.value = "form";
}

/**
 * Handle saved event from form
 */
function handleSaved(savedDraft) {
  selectedDraftId.value = savedDraft.id;
  toast.success("Draft saved successfully");
}

/**
 * Save draft via button click
 */
async function saveDraft() {
  try {
    const saved = await formState.saveDraft();
    selectedDraftId.value = saved.id;
    toast.success("Draft saved successfully");
  } catch (err) {
    toast.error(err.message || "Failed to save draft");
  }
}

/**
 * Submit request for review
 */
async function submitRequest() {
  try {
    await formState.submit();
    emit("submitted");
    toast.success("Access request submitted for review");
    hide();
  } catch (err) {
    // Note: If there's a 409 conflict, the error will be set in formState.conflictError
    // and should be shown in the form component
    if (formState.conflictError.value) {
      // Conflict is handled by the form component's alert
      return;
    }
    toast.error(err.message || "Failed to submit request");
  }
}

defineExpose({ show, hide });

// Auto-advance from picker to form if no drafts
watch(
  () => drafts.value.length,
  (count) => {
    if (visible.value && currentStep.value === "picker" && count === 0) {
      createNewRequest();
    }
  },
);
</script>
