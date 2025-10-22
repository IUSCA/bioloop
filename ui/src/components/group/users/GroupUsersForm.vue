<template>
  <div class="space-y-4">
    <UserSelect @select="handleUserSelect" />

    <div class="flex flex-row justify-between px-1">
      <span class="text-lg font-bold tracking-wide">Users to assign</span>
      <span class="text-right">
        {{ maybePluralize(users.length, "user") }}
      </span>
    </div>

    <GroupUsersList
      :users="users"
      show-remove
      @remove="handleRemove"
    />
  </div>
</template>

<script setup>
import { maybePluralize } from "@/services/utils";

const users = defineModel("users", { type: Array, default: () => [] });

function handleUserSelect(user) {
  // Check if user already exists
  const exists = users.value.some((u) => u.id === user.id);
  if (!exists) {
    users.value.push(user);
  }
}

function handleRemove(user) {
  users.value = users.value.filter((u) => u.id !== user.id);
}
</script>
