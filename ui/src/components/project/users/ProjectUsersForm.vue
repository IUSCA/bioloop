<template>
  <div class="space-y-4">
    <UserSelect @select="handleUserSelect" />

    <div class="flex flex-row justify-between px-1">
      <span class="text-lg font-bold tracking-wide">Users to assign</span>
      <span class="text-right"
        >{{ maybePluralize(projectFormStore.users.length, "user") }}
      </span>
    </div>

    <ProjectUsersList
      :users="projectFormStore.users"
      show-remove
      @remove="handleRemove"
    />
  </div>
</template>

<script setup>
import { maybePluralize } from "@/services/utils";
import { useProjectFormStore } from "@/stores/projects/projectForm";

const projectFormStore = useProjectFormStore();

function handleUserSelect(user) {
  projectFormStore.addUser(user);
}

function handleRemove(user) {
  projectFormStore.removeUser(user);
}
</script>
