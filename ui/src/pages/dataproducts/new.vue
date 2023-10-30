<template>
  <!-- Form -->
  <div class="w-full flex justify-center">
    <va-card class="md:max-w-xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <CreateDataProductStepper
          class=""
          @update="router.push('/dataproducts')"
        />
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
    label: "Data Products",
    to: "/dataproducts",
  },
  {
    label: "New Data Product",
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
