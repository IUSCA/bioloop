<template>
  <!-- Form -->
  <div class="w-full flex justify-center">
    <va-card class="flex-auto max-w-5xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <CreateProjectStepper @update="goToProjects" @cancel="goToProjects" />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";

const projectFormStore = useProjectFormStore();
const router = useRouter();

function goToProjects() {
  router.push("/projects");
}

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
