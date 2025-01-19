<template>
  <va-sidebar
    :class="[
      'custom-sidebar',
      {
        'va-sidebar--expanded': !isSidebarCollapsed,
        'va-sidebar--minimized': isSidebarCollapsed,
      },
    ]"
    :style="{
      width: isMobileView ? '100%' : '13rem',
      transform: isSidebarCollapsed ? 'translateX(-100%)' : 'translateX(0)',
    }"
  >
    <div class="va-sidebar__menu">
      <!-- User sidebar items -->
      <div v-if="user_items.length > 0">
        <SidebarItems :items="user_items" :isActive="isActive" />
        <va-divider />
      </div>

      <!-- Operator sidebar items -->
      <div v-if="auth.canOperate && operator_items.length > 0">
        <SidebarItems :items="operator_items" :isActive="isActive" />
        <va-divider />
      </div>

      <!-- Admin sidebar items -->
      <div v-if="auth.canAdmin && admin_items.length > 0">
        <SidebarItems :items="admin_items" :isActive="isActive" />
        <va-divider />
      </div>

      <!-- Other sidebar items -->
      <div v-if="bottom_items.length > 0">
        <SidebarItems :items="bottom_items" :isActive="isActive" />
      </div>
    </div>
  </va-sidebar>
</template>

<script setup>
import config from "@/config";
import constants from "@/constants";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useBreakpoint } from "vuestic-ui";

const props = defineProps({ isSidebarCollapsed: Boolean });

const user_items = constants.sidebar.user_items;
const operator_items = constants.sidebar.operator_items;
const admin_items = constants.sidebar.admin_items;
const bottom_items = constants.sidebar.bottom_items;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);

const breakpoint = useBreakpoint();
const isMobileView = computed(
  () => breakpoint.current === "xs" || breakpoint.current === "sm",
);

function isActive(path) {
  if (path === "/") return route.path === "/";
  if (
    route.path.startsWith("/datasets") &&
    sidebarDatasetType.value in config.dataset.types
  ) {
    return (
      path ===
      `/${config.dataset.types[sidebarDatasetType.value]?.collection_path}`
    );
  }
  return route.path.startsWith(path);
}

router.beforeEach(() => {
  sidebarDatasetType.value = null;
});
</script>

<style>
/* Custom sidebar styles to override defaults */
.custom-sidebar {
  position: fixed;
  top: var(--va-navbar-mobile-height);
  left: 0;
  height: 0; /* Full height below header */
  z-index: var(--va-sidebar-z-index); /* Ensure overlay */
  transform: translateX(-100%); /* Hide sidebar by default */
  transition: var(--va-sidebar-transition); /* Smooth slide-in/out */
}

/* Sidebar expanded state */
.custom-sidebar.va-sidebar--expanded {
  transform: translateX(0); /* Slide-in to show sidebar */
}

/* Sidebar minimized state */
.custom-sidebar.va-sidebar--minimized {
  transform: translateX(-100%); /* Slide-out to hide sidebar */
}

/* Scrollbar customization for the sidebar menu */
.custom-sidebar .va-sidebar__menu {
  overflow-y: auto !important; /* Ensure vertical scrolling */
  height: 100%; /* Ensure content fills the height */
  scrollbar-width: thin; /* Thin scrollbar */
  scrollbar-color: var(--va-secondary) transparent; /* Custom scrollbar color */
}

/* Webkit-specific scrollbar styles */
.custom-sidebar .va-sidebar__menu::-webkit-scrollbar {
  width: 4px;
}

.custom-sidebar .va-sidebar__menu::-webkit-scrollbar-thumb {
  background: var(--va-secondary); /* Scrollbar color */
  border-radius: 2px;
}
</style>
