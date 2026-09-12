<template>
  <div class="w-full">
    <div class="mb-3">
      <UserSearchSelect
        placeholder="Search users to add as admins..."
        :exclude-ids="props.excludeIds"
        @select="onSelectUser"
      />
    </div>

    <!-- Selected users as chips -->
    <TransitionGroup name="list" tag="div" class="flex flex-wrap gap-2">
      <UserChip
        v-for="user in modelValue"
        :key="user.id"
        :user="user"
        removable
        @remove="removeUser(user.id)"
      />
    </TransitionGroup>
  </div>
</template>

<script setup>
const props = defineProps({
  // Subject ids the search must not offer. The create form passes the signed-in user's own id:
  // making yourself an admin of a group you create is a checkbox there, not a search result.
  excludeIds: {
    type: Array,
    default: () => [],
  },
});

const model = defineModel({
  type: Array,
  default: () => [],
});

function onSelectUser(user) {
  // Prevent adding duplicates
  if (model.value.some((u) => u.id === user.id)) {
    return;
  }
  if (props.excludeIds.includes(user.subject_id)) {
    return;
  }
  model.value = [...model.value, user];
}

function removeUser(userId) {
  model.value = model.value.filter((u) => u.id !== userId);
}
</script>
