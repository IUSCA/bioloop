<template>
  <Header
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
        <breadcrumb-nav></breadcrumb-nav>
        <router-view></router-view>
      </div>
      <Footer></Footer>
    </main>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { useBreakpoint } from "vuestic-ui";
import { useUIStore } from "@/stores/ui";
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";

const breakpoint = useBreakpoint();
const ui = useUIStore();
const breadcrumbs = useBreadcrumbsStore();

let isSidebarCollapsed = ref(false);

onMounted(() => {
  breadcrumbs.pushNavItem({ icon: "home", to: "/" });
});

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
  }
);

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
};
</script>
