<template>
  <!-- Title -->
  <h2 class="text-3xl font-bold mb-4">Projects: Create New</h2>

  <!-- Form -->
  <div class="w-full flex justify-center">
    <va-card class="md:max-w-xl md:h-[calc(85vh)]">
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
</route>
