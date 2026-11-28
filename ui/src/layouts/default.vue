<template>
  <div class="flex h-screen flex-col">
    <Header
      class="shrink-0"
      :is-sidebar-collapsed="isSidebarCollapsed"
      @toggle-sidebar-visibility="toggleSidebarVisibility"
    />

    <div class="relative flex min-h-0 flex-1">
      <nav
        aria-label="menu nav"
        class="absolute inset-y-0 left-0 z-10 h-full flex-none shadow-xl md:relative md:z-auto"
        :inert="isSidebarCollapsed"
      >
        <Sidebar :is-sidebar-collapsed="isSidebarCollapsed" />
      </nav>

      <main
        id="main"
        class="flex min-w-0 flex-1 flex-col overflow-y-auto md:transition-[margin-left] md:duration-300 md:ease-in-out"
        :class="{ 'md:ml-16': !isSidebarCollapsed }"
      >
        <div class="grow px-2 md:px-6 pb-10 pt-4">
          <LeaveBreadcrumbs class="mb-2" />
          <router-view />
        </div>
        <Footer class="shrink-0" />
      </main>
    </div>
  </div>
</template>

<script setup>
// cspell:words vuestic
import { computed, ref, watch } from "vue";
import { useBreakpoint } from "vuestic-ui";

const breakpoint = useBreakpoint();
const isMobileView = computed(
  () => breakpoint.current === "xs" || breakpoint.current === "sm",
);
const isSidebarCollapsed = ref(isMobileView.value);

watch(isMobileView, (mobile) => {
  isSidebarCollapsed.value = mobile;
});

const toggleSidebarVisibility = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
};
</script>
