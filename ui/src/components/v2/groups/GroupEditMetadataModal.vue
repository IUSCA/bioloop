<template>
  <VaModal
    v-model="visible"
    title="Edit Group Metadata"
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
            placeholder="Group name"
            outline
            label="Group Name"
            required-mark
            :rules="nameRules"
          />
        </div>

        <!-- Description field -->
        <div class="flex flex-col gap-1.5">
          <VaTextarea
            v-model="formData.description"
            placeholder="Group description (optional)"
            outline
            :rows="3"
            label="Group Description"
            :rules="descriptionRules"
          />
        </div>

        <!-- User Contributions Toggle -->
        <GroupAllowMemberContribSwitch
          v-model="formData.allow_user_contributions"
        />
      </va-form>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import { useChangeTracker } from "@/composables/useChangeTracker";
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";
import { useForm } from "vuestic-ui";

const { validate, resetValidation, isValid } = useForm("formRef");

const props = defineProps({
  /** ID of the group being edited */
  groupId: { type: String, required: true },
  /** Current name of the group */
  name: { type: String, required: true },
  /** Current description of the group */
  description: { type: String, default: "" },
  /** Current allow_user_contributions setting */
  allowUserContributions: { type: Boolean, default: false },
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
  allow_user_contributions: false,
});
const { hasChanges, init, getUpdates } = useChangeTracker(formData);

const nameRules = [
  (value) => !!value || "Group name is required",
  (value) =>
    (value && value.length >= 2) || "Group name must be at least 2 characters",
  (value) =>
    (value && value.length <= 255) ||
    "Group name must be less than 255 characters",
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
    allow_user_contributions: props.allowUserContributions,
  };
  init(); // set baseline snapshot for change tracking
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
    await GroupService.update(props.groupId, updateData, props.version);
    hide();
    toast.success("Group metadata updated.");
    emit("update");
  } catch (err) {
    toast.error(
      err?.response?.data?.message ??
        "Failed to update group metadata. Please try again.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
