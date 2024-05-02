<template>
  <va-inner-loading :loading="loading">
    <!-- 
    Remounts the component when the path changes.
    
    This is useful when navigating to the same component, ex: from /datasets/1 to /datasets/2

    By default, for these navigations, the component is not unmounted, only the props change 
    and the setup code is not run again.
  -->
    <RouterView :key="$route.path" />
  </va-inner-loading>
</template>

<script setup>
import router from "@/router";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { useUIStore } from "@/stores/ui";
import { useBreakpoint, useColors } from "vuestic-ui";
import envService from "@/services/env";

const breakpoint = useBreakpoint();
const ui = useUIStore();
const auth = useAuthStore();
const { applyPreset, colors } = useColors();
const loading = ref(false);

const nav = useNavStore();
const isDark = useDark();

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

const fetchEnv = () => {
  loading.value = true;
  envService
    .getEnvironment()
    .then((res) => {
      auth.setEnv(res.data);
    })
    .catch((err) => {
      console.log(err);
    })
    .finally(() => {
      loading.value = false;
    });
};

watch(
  () => breakpoint.current,
  () => {
    setViewType();
  },
);

// change vuestic dark mode status reacting to isDark (boolean)
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
  },
);

onBeforeMount(() => {
  // register router Navigation Guards that require pinia stores
  router.beforeEach((to) => {
    if (to?.meta?.nav) {
      nav.setNavItems(to.meta.nav);
    }
  });

  auth.initialize();
});

onMounted(() => {
  fetchEnv();
  setupTheme();
  setViewType();
});
</script>
