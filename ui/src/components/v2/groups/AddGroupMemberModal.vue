<template>
  <VaModal
    v-model="visible"
    hide-default-actions
    no-outside-dismiss
    @cancel="hide"
  >
    <template #header>
      <div class="flex items-start gap-3 mb-7">
        <div
          class="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-sky-600/20 to-indigo-600/10 text-sky-600 dark:text-sky-200"
        >
          <i-mdi-account-plus class="text-2xl" />
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add group member
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Search for a user and select them to add to this group. Members
            inherit access from the group hierarchy.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3 mt-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="loading"
          :disabled="!canSubmit"
          :color="canSubmit ? 'success' : undefined"
          @click="confirm"
        >
          <i-mdi-account-plus class="mr-2" />
          Add {{ maybePluralize(selectedUsers.length, "member") }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <div class="space-y-3 min-h-[360px]">
        <UserSearchSelect
          placeholder="Search users by name, username, or email"
          @select="onSelectUser"
        />

        <div v-if="selectedUsers.length > 0" class="space-y-2">
          <div
            class="text-xs font-semibold uppercase tracking-wide va-text-secondary"
          >
            <span> Selected ({{ selectedUsers.length }})</span>
          </div>
          <TransitionGroup
            name="list"
            tag="div"
            class="grid gap-2 sm:grid-cols-2"
          >
            <div
              v-for="user in selectedUsers"
              :key="user.subject_id"
              class="flex items-center justify-between gap-3 rounded-xl border border-solid border-slate-200 bg-white/70 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/40"
            >
              <div class="flex items-center gap-3">
                <UserAvatar :username="user.username" :name="user.name" />
                <div class="truncate min-w-0 max-w-[250px]">
                  <div
                    class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                  >
                    {{ user.name || user.username }}
                  </div>
                  <div
                    class="text-xs text-gray-500 dark:text-gray-400 truncate"
                  >
                    {{ user.email }}
                  </div>
                </div>
              </div>
              <VaButton
                size="small"
                preset="plain"
                color="danger"
                icon="close"
                @click="removeUser(user.subject_id)"
              >
              </VaButton>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import { maybePluralize } from "@/services/utils";
import GroupService from "@/services/v2/groups";

const props = defineProps({
  groupId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["update"]);

defineExpose({ show, hide });

const visible = ref(false);
const loading = ref(false);
const selectedUsers = ref([]);

const selectedIds = computed(() =>
  selectedUsers.value.map((u) => u.subject_id),
);

const canSubmit = computed(
  () => selectedUsers.value.length > 0 && !loading.value,
);

function show() {
  visible.value = true;
  selectedUsers.value = [];
}

function hide() {
  visible.value = false;
}

function onSelectUser(user) {
  if (!user || !user.subject_id) return;

  if (selectedIds.value.includes(user.subject_id)) {
    return;
  }

  selectedUsers.value.push(user);
}

function removeUser(subjectId) {
  selectedUsers.value = selectedUsers.value.filter(
    (u) => u.subject_id !== subjectId,
  );
}

async function confirm() {
  if (!canSubmit.value) return;

  loading.value = true;

  try {
    const members = selectedUsers.value.map((user) => ({
      user_id: user.subject_id,
    }));
    await GroupService.bulkAddMembers(props.groupId, members);

    toast.success(
      `Added ${maybePluralize(selectedUsers.value.length, "member")} to the group.`,
    );

    hide();
    emit("update");
  } catch (err) {
    console.error("Failed to add group members:", err);
    toast.error(
      err?.response?.data?.message ??
        "Failed to add member(s). Please try again.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
