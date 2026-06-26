<template>
  <div class="flex flex-col gap-3">
    <!-- Toggle buttons: Myself vs A group I administer -->
    <div class="flex items-center gap-2">
      <button
        @click="selectMyself"
        :class="[
          'px-3 py-2 text-sm font-medium rounded-lg transition-all',
          selectedMode === 'myself'
            ? 'bg-blue-500 text-white dark:bg-blue-600'
            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
        ]"
      >
        Myself
      </button>
      <button
        v-if="uiPersona.isGroupAdmin"
        @click="selectedMode = 'group'"
        :class="[
          'px-3 py-2 text-sm font-medium rounded-lg transition-all',
          selectedMode === 'group'
            ? 'bg-blue-500 text-white dark:bg-blue-600'
            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
        ]"
      >
        A group I administer
      </button>
    </div>

    <!-- Myself mode: Show current user info -->
    <div v-if="selectedMode === 'myself'" class="flex items-center gap-2">
      <div
        v-if="modelValue?.id"
        class="flex flex-1 items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-solid border-gray-200 dark:border-gray-700"
      >
        <UserAvatar :user="modelValue" size="sm" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ modelValue?.name }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
            {{ modelValue?.email }}
          </p>
        </div>
      </div>
    </div>

    <!-- Group mode: Show search and selection -->
    <div v-if="selectedMode === 'group'" class="flex flex-col gap-3">
      <AdminGroupSearchSelect
        v-model="selectedGroup"
        @update:modelValue="handleGroupSelect"
      />

      <!-- Show selected group -->
      <div
        v-if="selectedGroup?.id"
        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-solid border-blue-200 dark:border-blue-800"
      >
        <div
          class="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
        >
          <i-mdi-account-multiple class="text-base" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ selectedGroup?.name }}</p>
          <p class="text-xs text-blue-600 dark:text-blue-300">Group</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import { useUIPersonaStore } from "@/stores/v2/uiPersona";

const props = defineProps({
  modelValue: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update:modelValue"]);

const auth = useAuthStore();
const uiPersona = useUIPersonaStore();
const selectedMode = ref("myself");
const selectedGroup = ref(null);

/**
 * Select myself
 */
function selectMyself() {
  selectedMode.value = "myself";
  if (auth.user?.subject_id) {
    emit("update:modelValue", {
      id: auth.user.subject_id,
      type: "USER",
      user: auth.user,
    });
  }
}

/**
 * Handle group selection
 */
function handleGroupSelect(group) {
  if (group?.id) {
    emit("update:modelValue", {
      id: group.id,
      type: "GROUP",
      group: group,
    });
  }
}

// Initialize with current user on mount
onMounted(async () => {
  // Ensure persona is loaded
  if (!uiPersona.isLoaded) {
    await uiPersona.fetchPersona();
  }

  if (!props.modelValue && auth.user?.subject_id) {
    selectMyself();
  }
});
</script>
