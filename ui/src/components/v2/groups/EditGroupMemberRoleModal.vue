<template>
  <VaModal
    v-model="visible"
    :title="modalTitle"
    hide-default-actions
    no-outside-dismiss
    @cancel="hide"
  >
    <template #footer>
      <div class="flex items-center justify-end gap-3 mt-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="loading"
          :disabled="!canConfirm"
          :color="actionColor"
          @click="confirm"
        >
          {{ actionLabel }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <div
        class="min-h-[240px] flex flex-col justify-center items-center text-center px-6"
      >
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{
            isAdmin
              ? `You are about to revoke admin rights from ${memberName}.`
              : `You are about to grant admin rights to ${memberName}.`
          }}
        </p>
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
          {{
            isAdmin
              ? "They will remain a member but will no longer be able to manage group membership, settings, or access grants."
              : "Admins can manage group membership, settings, and access grants for this group."
          }}
        </p>
      </div>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import GroupService from "@/services/v2/groups";

const props = defineProps({
  groupId: {
    type: String,
    required: true,
  },
  member: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);

const memberName = computed(() => {
  return (
    props.member?.user?.name || props.member?.user?.username || "this member"
  );
});

const isAdmin = computed(() => {
  const role = props.member?.effective_role;
  return typeof role === "string" && role.toUpperCase().includes("ADMIN");
});

const modalTitle = computed(() =>
  isAdmin.value ? "Demote group admin" : "Promote group admin",
);

const actionLabel = computed(() =>
  isAdmin.value ? "Demote to member" : "Promote to admin",
);

const actionColor = computed(() => (isAdmin.value ? "danger" : "success"));

const canConfirm = computed(
  () => !!props.member?.user?.subject_id && !loading.value,
);

function show() {
  visible.value = true;
}

function hide() {
  visible.value = false;
}

defineExpose({ show, hide });

async function confirm() {
  if (!canConfirm.value) return;

  loading.value = true;

  try {
    const userId = props.member.user.subject_id;

    if (isAdmin.value) {
      await GroupService.removeAdmin(props.groupId, userId);
      toast.success(`${memberName.value} has been demoted to member.`);
    } else {
      await GroupService.promoteToAdmin(props.groupId, userId);
      toast.success(`${memberName.value} has been promoted to admin.`);
    }

    hide();
    emit("update");
  } catch (err) {
    toast.error(
      err?.response?.data?.message ?? "Failed to update member role.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
