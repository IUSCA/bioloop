<template>
  <!-- 
    Remounts the component when the path changes.
    
    This is useful when navigating to the same component, ex: from /datasets/1 to /datasets/2

    By default, for these navigations, the component is not unmounted, only the props change 
    and the setup code is not run again.
  -->
  <RouterView :key="$route.fullPath" />
</template>

<script setup>
import { useToast } from "vuestic-ui";

import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";

const auth = useAuthStore();
const toast = useToastStore();
toast.setup(useToast());

onBeforeMount(() => {
  auth.initialize();
});
</script>
