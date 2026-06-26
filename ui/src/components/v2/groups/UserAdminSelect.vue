<template>
  <div class="w-full">
    <div class="mb-3">
      <UserSearchSelect
        placeholder="Search users to add as admins..."
        @select="onSelectUser"
      />
      <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
        You will be added as admin automatically. Add others here.
      </p>
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
const model = defineModel({
  type: Array,
  default: () => [],
});

function onSelectUser(user) {
  // Prevent adding duplicates
  if (model.value.some((u) => u.id === user.id)) {
    return;
  }
  model.value = [...model.value, user];
}

function removeUser(userId) {
  model.value = model.value.filter((u) => u.id !== userId);
}
</script>
