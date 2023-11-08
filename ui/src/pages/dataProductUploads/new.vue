<template>
  <div class="w-full flex justify-center">
    <va-card class="md:max-w-2xl md:h-[calc(85vh)]">
      <va-card-content class="h-full">
        <CreateDataProductStepper />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";

const nav = useNavStore();

nav.setNavItems([
  {
    label: "Data Product Uploads",
    to: "/dataProductUploads",
  },
  {
    label: "Upload Data Product",
  },
]);
</script>
