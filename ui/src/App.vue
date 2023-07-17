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
import { useColors } from "vuestic-ui";

import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";

const auth = useAuthStore();
const toast = useToastStore();
toast.setup(useToast());

onMounted(() => {
  setupTheme()
})

watch(auth.user.theme, () => {
  setupTheme()
}, { deep: true })

const setupTheme = () => {
  if ('user' in auth && 'theme' in auth.user) {
    const { applyPreset, colors } = useColors();

    applyPreset(auth.user?.theme?.mode)
    colors.primary = auth.user.theme?.primary
  }
}

onBeforeMount(() => {
  auth.initialize();
});
</script>
