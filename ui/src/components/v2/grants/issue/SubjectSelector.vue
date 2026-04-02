<template>
  <div>
    <!-- <p class="mb-2 text-sm font-medium uppercase tracking-wide">Subject</p> -->

    <!-- Type toggle -->
    <div class="mb-3 flex gap-2">
      <ModernButtonToggle
        v-model="subjectType"
        :options="subjectTypeOptions"
        value-by="value"
        label="Select Type"
      />
    </div>

    <!-- Selected subject chip -->
    <div v-if="model && model.id">
      <SubjectChip :subject="model" removable @remove="handleRemove" />
    </div>

    <div v-else>
      <!-- User Search and Selection -->
      <UserSearchSelect
        v-if="subjectType === 'USER'"
        placeholder="Search users by name, username, or email"
        @select="onSelectUser"
      />

      <!-- Group Search and Selection -->
      <div v-else-if="subjectType === 'GROUP'">
        <!-- quick groups -->
        <div v-if="quickGroups.length" class="mb-3 flex flex-wrap gap-2">
          <span class="text-sm va-text-secondary"> Quick Select: </span>
          <i-mdi-loading
            v-if="contextLoading"
            class="animate-spin text-base text-gray-400 dark:text-gray-500"
            aria-label="Loading group context"
          />
          <button
            v-for="group in quickGroups"
            :key="group.id"
            class="rounded-xl px-3 py-1 text-xs ring-1 flex items-center gap-1"
            :class="QUICK_GROUP_CLASSES[group.tag]"
            @click="onSelectGroup(group)"
            :title="group.help ?? group.description"
          >
            <Icon :icon="group.icon" class="" />
            <span>
              {{ [group.label, group.name].filter(Boolean).join(": ") }}
            </span>
          </button>
        </div>

        <GroupSearchSelect
          placeholder="Search groups by name"
          @select="onSelectGroup"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import constants from "@/constants";
import groupService from "@/services/v2/groups";

const model = defineModel();

const props = defineProps({
  resourceOwnerGroupId: {
    type: String,
    required: true,
  },
});

const quickGroups = computed(() => {
  const groups = [constants.EVERYONE_GROUP];
  if (ownerGroup.value && !contextLoading.value) {
    groups.push({
      ...ownerGroup.value,
      label: "Owner",
      tag: "owner",
      icon: "mdi-shield-account",
      help: "The owning group of the resource.",
    });
  }
  return groups;
});

const subjectType = ref("GROUP");
const ownerGroup = ref(null);
const contextLoading = ref(false);

const subjectTypeOptions = [
  { label: "User", value: "USER" },
  { label: "Group", value: "GROUP" },
];

const QUICK_GROUP_CLASSES = {
  everyone:
    "bg-green-50 text-green-700 ring-green-200 dark:bg-green-950 dark:text-green-300 dark:ring-green-800",
  owner:
    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800",
  ancestor:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800",
};

function onSelectUser(user) {
  model.value = { user, type: "USER", id: user.subject_id };
}

function onSelectGroup(group) {
  model.value = { group, type: "GROUP", id: group.id };
}

function handleRemove() {
  model.value = null;
}

watch(subjectType, () => {
  model.value = null; // Clear selection when type changes
});

watch(
  () => props.resourceOwnerGroupId,
  () => {
    if (!props.resourceOwnerGroupId) return;
    contextLoading.value = true;
    groupService
      .get(props.resourceOwnerGroupId)
      .then((res) => {
        ownerGroup.value = res.data;
      })
      .catch((err) => {
        console.error("Failed to load owner group:", err);
        ownerGroup.value = {
          name: "Resource Owning Group",
          tag: "owner",
          icon: "mdi-shield-account",
          help: "The owning group of the resource.",
        };
      })
      .finally(() => {
        contextLoading.value = false;
      });
  },
  { immediate: true },
);
</script>
