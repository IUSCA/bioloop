<template>
  <VaModal
    v-model="visible"
    title="Edit Collection Metadata"
    hide-default-actions
    @cancel="hide"
  >
    <template #footer>
      <div class="flex items-center gap-5 justify-end mt-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="loading"
          :disabled="!isValidForSubmit"
          @click="confirm"
        >
          Save Changes
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <va-form ref="formRef" class="flex flex-col gap-5 text-sm">
        <!-- Name field -->
        <div class="flex flex-col gap-1.5">
          <VaInput
            v-model="formData.name"
            placeholder="Collection name"
            outline
            label="Collection Name"
            required-mark
            :rules="nameRules"
          />
        </div>

        <!-- Description field -->
        <div class="flex flex-col gap-1.5">
          <VaTextarea
            v-model="formData.description"
            placeholder="Collection description (optional)"
            outline
            :rows="3"
            label="Collection Description"
            :rules="descriptionRules"
          />
        </div>
      </va-form>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import { useChangeTracker } from "@/composables/useChangeTracker";
import toast from "@/services/toast";
import CollectionService from "@/services/v2/collections";
import { useForm } from "vuestic-ui";

const { validate, resetValidation, isValid } = useForm("formRef");

const props = defineProps({
  /** ID of the collection being edited */
  collectionId: { type: String, required: true },
  /** Current name of the collection */
  name: { type: String, required: true },
  /** Current description of the collection */
  description: { type: String, default: "" },
  /** Current version (for optimistic locking) */
  version: { type: Number, required: true },
});

const emit = defineEmits(["update"]);
defineExpose({ show, hide });

const visible = ref(false);
const loading = ref(false);
const formData = ref({
  name: "",
  description: "",
});
const { hasChanges, init, getUpdates } = useChangeTracker(formData);

const nameRules = [
  (value) => !!value || "Collection name is required",
  (value) =>
    (value && value.length >= 2) ||
    "Collection name must be at least 2 characters",
  (value) =>
    (value && value.length <= 255) ||
    "Collection name must be less than 255 characters",
];

const descriptionRules = [
  (value) =>
    (value ? value.length <= 2000 : true) ||
    "Description must be less than 2000 characters",
];

async function show() {
  // Reset form to initial state
  formData.value = {
    name: props.name,
    description: props.description || "",
  };
  init();
  visible.value = true;

  // Clear any previous validation errors when reopening the modal
  resetValidation();
}

function hide() {
  visible.value = false;
}

/**
 * Determine if form is ready for submission
 */
const isValidForSubmit = computed(() => hasChanges.value && isValid.value);

async function confirm() {
  if (!hasChanges.value || !validate()) {
    return;
  }

  loading.value = true;

  try {
    const updateData = getUpdates();
    await CollectionService.update(
      props.collectionId,
      updateData,
      props.version,
    );
    hide();
    toast.success("Collection metadata updated.");
    emit("update");
  } catch (err) {
    toast.error(
      err?.response?.data?.message ??
        "Failed to update collection metadata. Please try again.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
