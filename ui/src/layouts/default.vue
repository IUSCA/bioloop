<template>
  <Header
    :is-mobile-view="isMobileView"
    :is-sidebar-collapsed="isSidebarCollapsed"
    @toggle-sidebar-visibility="toggleSidebarVisibility"
  >
  </Header>
  <div class="flex flex-row h-screen">
    <nav
      aria-label="menu nav"
      class="relative h-full content-center flex-none shadow-xl"
    >
      <Sidebar :isSidebarCollapsed="isSidebarCollapsed"></Sidebar>
    </nav>
    <main id="main" class="overflow-y-scroll">
      <div class="px-4 pb-10 pt-3 min-h-screen">
        <router-view></router-view>
      </div>
      <Footer></Footer>
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { useBreakpoint } from "vuestic-ui";

const breakpoint = useBreakpoint();

let isSidebarCollapsed = ref(false);
let isMobileView = ref(false);

watch(
  () => breakpoint.current,
  (newValue, oldValue) => {
    isMobileView.value = !(breakpoint.xl || breakpoint.lg || breakpoint.md);

    // If sidebar is already open when going from screen size SM to XS, or XS
    // to SM, it should stay open.
    if (!isSidebarCollapsed.value) {
      if (
        (oldValue === "xs" && newValue === "sm") ||
        (oldValue === "sm" && newValue === "xs")
      ) {
        return;
      }
    }
    isSidebarCollapsed.value = isMobileView;
  }
);

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
};
</script>
