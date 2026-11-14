<template>
  <div class="flex h-screen flex-col">
    <Header
      class="shrink-0"
      :is-sidebar-collapsed="isSidebarCollapsed"
      @toggle-sidebar-visibility="toggleSidebarVisibility"
    />

    <!-- Show any active alerts in the system -->
    <Alerts v-if="auth.isFeatureEnabled('alerts')" class="shrink-0" />

    <div class="flex min-h-0 flex-1">
      <nav
        aria-label="menu nav"
        class="relative h-full content-center flex-none shadow-xl"
      >
        <Sidebar :isSidebarCollapsed="isSidebarCollapsed"></Sidebar>
      </nav>
      <main id="main" class="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div class="grow px-2 md:px-6 pb-10 pt-4">
          <LeaveBreadcrumbs class="mb-2" />
          <router-view></router-view>
        </div>
        <Footer class="shrink-0" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { useAlertStore } from "@/stores/alert";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { ref, watch } from "vue";
import { useBreakpoint } from "vuestic-ui";

const auth = useAuthStore();
const breakpoint = useBreakpoint();
const ui = useUIStore();
const alertStore = useAlertStore();

let isSidebarCollapsed = ref(false);

watch(
  () => breakpoint.current,
  (newValue, oldValue) => {
    // When going from screen size SM to XS, or XS to SM, the sidebar's
    // open/collapsed state should not change
    if (
      (oldValue === "xs" && newValue === "sm") ||
      (oldValue === "sm" && newValue === "xs")
    ) {
      return;
    }

    // When going from screen size XL to LG, or LG to MD, if sidebar is
    // already collapsed, it should stay collapsed
    if (
      (oldValue === "xl" && newValue === "lg") ||
      (oldValue === "lg" && newValue === "md")
    ) {
      if (isSidebarCollapsed.value) {
        return;
      }
    }

    // In all other cases, update the open/collapse state acc. to screen size
    isSidebarCollapsed.value = ui.isMobileView;
  },
);

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
};

onMounted(() => {
  if (auth.isFeatureEnabled("alerts")) {
    alertStore.startPolling();
  }
});

onUnmounted(() => {
  alertStore.stopPolling();
});
</script>

<style scoped>
html.dark #main {
  color-scheme: dark;
}

/* Keep the native dark scrollbar without changing the page's controls. */
html.dark #main > * {
  color-scheme: normal;
}
</style>
