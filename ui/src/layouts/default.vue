<template>
  <Header
    :is-sidebar-collapsed="isSidebarCollapsed"
    @toggle-sidebar-visibility="toggleSidebarVisibility"
  >
  </Header>

  <!-- Show any active alerts in the system  -->
  <Alerts />

  <div class="flex flex-row h-screen">
    <nav
      aria-label="menu nav"
      class="relative h-full content-center flex-none shadow-xl"
    >
      <Sidebar :isSidebarCollapsed="isSidebarCollapsed"></Sidebar>
    </nav>
    <main id="main" class="w-full overflow-y-scroll">
      <div class="px-2 md:px-6 pb-10 pt-4 min-h-screen">
        <LeaveBreadcrumbs class="mb-2" />
        <router-view></router-view>
      </div>
      <Footer></Footer>
    </main>
  </div>
</template>

<script setup>
import { useUIStore } from "@/stores/ui";
import { ref, watch } from "vue";
import { useBreakpoint } from "vuestic-ui";
import { useAlertStore } from "@/stores/alert";

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
  alertStore.startPolling();
});

onUnmounted(() => {
  alertStore.stopPolling();
});
</script>
