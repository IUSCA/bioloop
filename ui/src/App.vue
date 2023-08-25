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
import { useBreakpoint } from "vuestic-ui";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";
import { useUIStore } from "@/stores/ui";

const breakpoint = useBreakpoint();
const ui = useUIStore();
const auth = useAuthStore();
const toast = useToastStore();
toast.setup(useToast());

const isDark = useDark();

onMounted(() => {
  setupTheme();
  setViewType();
});

const setViewType = () => {
  ui.setMobileView(!(breakpoint.xl || breakpoint.lg || breakpoint.md));
};

// read the custom theme's primary color from local storage and update vuestic
// user.auth.theme is set from the profile page when user chooses a color from the palette
const setupTheme = () => {
  if (auth?.user?.theme?.primary) {
    colors.primary = auth.user.theme.primary;
  }
};

watch(
  () => breakpoint.current,
  () => {
    setViewType();
  }
);

// change vuestic dark mode status reacting to isDark
// isDark's value is read from local storage "vueuse-color-scheme" which has values "auto" and "dark"
// isDark is also set by the window property "prefers-color-scheme" that is set according to the browser / system's theme
// isDark is also changed by the dark mode toggle button in the header
watch(
  isDark,
  () => {
    applyPreset(isDark.value ? "dark" : "light");
  },
  {
    immediate: true,
  }
);

onBeforeMount(() => {
  auth.initialize();
});

onMounted(() => {
  setupTheme();
  setViewType();
});
</script>
