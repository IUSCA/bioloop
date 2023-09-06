<template>
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
import { useNavStore } from "@/stores/nav";

const projectFormStore = useProjectFormStore();
const router = useRouter();
const nav = useNavStore();

nav.setNavItems([
  {
    label: "Projects",
    to: "/projects",
  },
  {
    label: "New Project",
  },
]);

onUnmounted(() => {
  // clear project store when navigating away from this page
  projectFormStore.$reset();
});
</script>

<route lang="yaml">
meta:
  title: Create Project
  requiresRoles: ["operator", "admin"]
</route>
