<template>
  <va-modal
    v-model="visible"
    title="Manage Users"
    no-outside-dismiss
    fixed-layout
    size="small"
    @ok="handleOk"
    @close="hide"
  >
    <va-inner-loading
      :loading="loading"
      class="sm:min-h-[50vh] sm:max-h-[50vh] min-h-[65vh] max-h-[65vh]"
    >
      <GroupUsersForm v-model:users="selectedUsers" />
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import groupService from "@/services/group";
import toast from "@/services/toast";

const props = defineProps({
  groupId: {
    type: String,
    required: true,
  },
  initialUsers: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update"]);

defineExpose({
  show,
  hide,
});

const loading = ref(false);
const visible = ref(false);
const selectedUsers = ref([]);

function hide() {
  loading.value = false;
  visible.value = false;
  selectedUsers.value = [];
}

function show() {
  visible.value = true;
  // Initialize with current users
  selectedUsers.value = props.initialUsers.map((u) => u.user);
}

async function handleOk() {
  loading.value = true;
  try {
    const user_ids = selectedUsers.value.map((u) => u.id);
    await groupService.updateUsers(props.groupId, user_ids);
    toast.success("Users updated successfully");
    emit("update");
    hide();
  } catch (error) {
    toast.error("Failed to update users");
  } finally {
    loading.value = false;
  }
}
</script>
