<template>
  <div class="space-y-4">
    <ProjectSelect @select="handleProjectSelect" />

    <div class="flex flex-row justify-between px-1">
      <span class="text-lg font-bold tracking-wide">Projects to assign</span>
      <span class="text-right">
        {{ maybePluralize(projects.length, "project") }}
      </span>
    </div>

    <GroupProjectsList
      :projects="projects"
      show-remove
      @remove="handleRemove"
    />
  </div>
</template>

<script setup>
import { maybePluralize } from "@/services/utils";

const projects = defineModel("projects", { type: Array, default: () => [] });

function handleProjectSelect(project) {
  // Check if project already exists
  const exists = projects.value.some((p) => p.id === project.id);
  if (!exists) {
    projects.value.push(project);
  }
}

function handleRemove(project) {
  projects.value = projects.value.filter((p) => p.id !== project.id);
}
</script>
