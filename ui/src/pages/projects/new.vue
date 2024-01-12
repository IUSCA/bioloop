<template>
  <!-- Form -->
  <div class="w-full flex justify-center">
    <va-card class="new-project-card md:h-[calc(85vh)]">
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

<style scoped>
.new-project-card {
  @media (max-width: 767px) {
    width: 100%;
    min-width: fit-content;
  }

  @media (min-width: 768px) {
    width: 576px;
  }
}
</style>

<route lang="yaml">
meta:
  title: Create Project
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Projects" }, { label: "New Project" }]
</route>
