<template>
  <!-- Form -->
  <div class="w-full flex justify-center">
    <va-card class="flex-auto max-w-xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <CreateProjectStepper class="" @update="router.push('/projects')" />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";

const projectFormStore = useProjectFormStore();
const router = useRouter();

onUnmounted(() => {
  // clear project store when navigating away from this page
  projectFormStore.$reset();
});
</script>

<route lang="yaml">
meta:
  title: Create Project
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Projects" }, { label: "New Project" }]
</route>
