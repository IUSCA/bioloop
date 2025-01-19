<template>
  <Header
    :is-sidebar-collapsed="isSidebarCollapsed"
    @toggle-sidebar-visibility="toggleSidebarVisibility"
  />
  <div class="flex flex-row h-screen">
    <!-- Sidebar -->
    <nav
      aria-label="menu nav"
      class="relative h-full flex-none shadow-xl"
      :style="{
        width: isMobileView
          ? isSidebarCollapsed
            ? '0'
            : '100%'
          : isSidebarCollapsed
            ? '0'
            : '13rem',
      }"
    >
      <Sidebar :isSidebarCollapsed="isSidebarCollapsed" />
    </nav>

    <!-- Main Content -->
    <main
      id="main"
      class="w-full overflow-y-scroll"
      :class="[
        isMobileView
          ? ''
          : isSidebarCollapsed
            ? 'main-content--full'
            : 'main-content--shifted',
      ]"
    >
      <div class="px-2 md:px-6 pb-10 pt-4 min-h-screen">
        <LeaveBreadcrumbs class="mb-2" />
        <router-view />
      </div>
      <Footer />
    </main>
  </div>
</template>

<script setup>
import { useUIStore } from "@/stores/ui";
import { computed, onUnmounted, ref, watch } from "vue";
import { useBreakpoint } from "vuestic-ui";

const ui = useUIStore();
const breakpoint = useBreakpoint();

let isSidebarCollapsed = ref(false);

const isMobileView = computed(
  () => breakpoint.current === "xs" || breakpoint.current === "sm",
);

watch(
  () => breakpoint.current,
  (newValue, oldValue) => {
    if (isMobileView.value) return; // Keep mobile behavior unchanged
    if (
      (oldValue === "xs" && newValue === "sm") ||
      (oldValue === "sm" && newValue === "xs") ||
      (oldValue === "xl" && newValue === "lg") ||
      (oldValue === "lg" && newValue === "md")
    ) {
      return;
    }
    isSidebarCollapsed.value = ui.isMobileView;
  },
);

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;

  // Lock scrolling on mobile only
  if (isMobileView.value) {
    document.body.style.overflow = isSidebarCollapsed.value ? "auto" : "hidden";
  }
};

onUnmounted(() => {
  document.body.style.overflow = "auto";
});
</script>

<style>
/* Main content when sidebar is expanded */
.main-content--shifted {
  margin-left: 4rem; /* Push content */
  transition: margin-left 0.3s ease-in-out;
}

/* Main content when sidebar is collapsed */
.main-content--full {
  margin-left: 0; /* Full width */
  transition: margin-left 0.3s ease-in-out;
}
</style>
