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
            <h2 class="text-xl font-semibold">Request Access</h2>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Submit a formal access request for review.
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal footer -->
    <template #footer>
      <div
        class="w-full flex items-center justify-end gap-3 border-t border-solid border-gray-200 dark:border-gray-600 pt-4"
      >
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>

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
      </div>
    </template>

    <!-- Modal content -->
    <VaInnerLoading :loading="accessTypesLoading || presetsLoading">
      <ErrorState
        v-if="accessTypesError || presetsError"
        :message="accessTypesError || presetsError"
        @retry="
          fetchAccessTypes();
          fetchPresets();
        "
      />

      <!-- Request form -->
      <RequestAccessForm
        v-else
        :resource="props.resource"
        @saved="handleSaved"
      />
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import { useAccessTypes } from "@/components/v2/grants/issue/useAccessTypes";
import { useGrantPresets } from "@/components/v2/grants/issue/useGrantPresets";
import toast from "@/services/toast";
import { useRequestAccessForm } from "./useRequestAccessForm";

const props = defineProps({
  resource: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["submitted"]);

const visible = ref(false);

// Get access types and presets
const {
  loading: accessTypesLoading,
  error: accessTypesError,
  fetch: fetchAccessTypes,
} = useAccessTypes(computed(() => props.resource?.type));

const {
  loading: presetsLoading,
  error: presetsError,
  fetch: fetchPresets,
} = useGrantPresets(computed(() => props.resource?.type));

// Form state
const formState = useRequestAccessForm({
  resource: props.resource,
});

/**
 * Show modal
 */
function show() {
  formState.reset();
  visible.value = true;
}

/**
 * Hide modal
 */
function hide() {
  visible.value = false;
}

/**
 * Handle saved event from form (if needed for future draft functionality)
 */
function handleSaved(savedDraft) {
  // Currently unused, but kept for future extensibility
  console.log("Form saved draft:", savedDraft);
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
    if (formState.conflictError.value) {
      // Conflict is handled by the form component's alert
      return;
    }
    toast.error(err.message || "Failed to submit request");
  }
}

defineExpose({ show, hide });
</script>
