<template>
  <UserAvatar
    v-if="isUser"
    :key="`user-${props.subject.user?.id}`"
    :name="props.subject.user?.name"
    :username="props.subject.user?.id"
  />
  <GroupIcon
    v-else-if="isGroup"
    :key="`group-${props.subject.group?.id}`"
    :group="props.subject.group"
    :size="props.size"
  />
  <div
    v-else
    class="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500"
  >
    <i-mdi-help-circle-outline />
  </div>
</template>

<script setup>
import UserAvatar from "@/components/utils/UserAvatar.vue";
import GroupIcon from "@/components/v2/groups/GroupIcon.vue";

const props = defineProps({
  subject: {
    type: Object,
    required: true,
    // shape: { id, type: "USER" | "GROUP", user?: {...}, group?: {...} }
  },
  size: {
    type: String,
    default: "base",
    // xs, sm, base, lg — passed to GroupIcon
  },
});

const subjectType = computed(() =>
  (props.subject?.type || "").toString().toLowerCase(),
);

const isUser = computed(() => subjectType.value === "user");

const isGroup = computed(() => subjectType.value === "group");
</script>
