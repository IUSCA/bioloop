<template>
  <va-sidebar
    :minimized="props.isSidebarCollapsed"
    class="pt-2"
    width="13rem"
    minimizedWidth="0"
  >
    <va-sidebar-item
      v-for="(item, i) in user_items"
      :key="i"
      :to="item.path"
      :active="isActive(item.path)"
    >
      <va-sidebar-item-content>
        <Icon :icon="item.icon" class="text-2xl" />
        <!-- User can hide item with css if they want -->
        <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
      </va-sidebar-item-content>
    </va-sidebar-item>

    <va-divider v-if="user_items.length > 0" />

    <!-- operator items -->
    <div v-if="auth.canOperate">
      <va-sidebar-item
        v-for="(item, i) in operator_items"
        :key="i"
        :to="item.path"
        :active="isActive(item.path)"
      >
        <va-sidebar-item-content>
          <Icon :icon="item.icon" class="text-2xl" />
          <!-- User can hide item with css if they want -->
          <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
        </va-sidebar-item-content>
      </va-sidebar-item>

      <va-divider v-if="operator_items.length > 0" />
    </div>

    <!-- admin items -->
    <div v-if="auth.canAdmin">
      <va-sidebar-item
        v-for="(item, i) in admin_items"
        :key="i"
        :to="item.path"
        :active="isActive(item.path)"
      >
        <va-sidebar-item-content>
          <Icon :icon="item.icon" class="text-2xl" />
          <!-- User can hide item with css if they want -->
          <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
        </va-sidebar-item-content>
      </va-sidebar-item>

      <va-divider v-if="admin_items.length > 0" />
    </div>

    <va-sidebar-item
      v-for="(item, i) in bottom_items"
      :key="i"
      :to="item.path"
      :active="isActive(item.path)"
    >
      <va-sidebar-item-content>
        <Icon :icon="item.icon" class="text-2xl" />
        <!-- User can hide item with css if they want -->
        <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
      </va-sidebar-item-content>
    </va-sidebar-item>
  </va-sidebar>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { storeToRefs } from "pinia";
import config from "@/config";

const props = defineProps({ isSidebarCollapsed: Boolean });

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);

function isActive(path) {
  /**
   * This function is executed for every sidebar item rendered
   * If the return value is true, that item is highlighted
   * path is from the sidebar item config
   * route.path is the actual path in the browser URL
   *
   * Since paths of all components start with '/', dashboard requires a special check
   * All types of datasets use the same /datasets/ prefix, these require special handling
   */
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

const user_items = ref([
  {
    icon: "mdi-flask",
    title: "Projects",
    path: "/projects",
  },
  // {
  //   icon: "mdi-chart-gantt",
  //   title: "Tracks",
  //   path: "/tracks",
  // },
  // {
  //   icon: "mdi-chart-timeline",
  //   title: "Sessions",
  //   path: "/sessions",
  // },
]);

const operator_items = ref([
  {
    icon: "mdi-monitor-dashboard",
    title: "Dashboard",
    path: "/dashboard",
  },
  // {
  //   icon: "mdi-file-lock",
  //   title: "Data Products",
  //   path: "/dataproducts",
  // },
  // {
  //   icon: "mdi-transition",
  //   title: "Conversions",
  //   path: "/conversions",
  // },
  // {
  //   icon: "mdi-folder-upload",
  //   title: "Data Uploader",
  //   path: "/datauploader",
  // },
  {
    icon: "mdi-dna",
    title: "Raw Data",
    path: "/rawdata",
  },
  {
    icon: "mdi-package-variant-closed",
    title: "Data Products",
    path: "/dataproducts",
  },
  {
    icon: "mdi-content-copy",
    title: "Duplicate Datasets",
    path: "/duplicateDatasets",
  },
  {
    icon: "mdi-file-cog-outline",
    title: "Ingest",
    path: "/ingest",
  },
  {
    icon: "mdi-table-account",
    title: "User Management",
    path: "/users",
  },
  {
    icon: "mdi-format-list-bulleted",
    title: "Stats/Tracking",
    path: "/stats",
  },
  {
    icon: "mdi:map-marker-path",
    title: "Workflows",
    path: "/workflows",
  },
  // {
  //   icon: "mdi-account-multiple",
  //   title: "Group Management",
  //   path: "/groups",
  // },
  // {
  //   icon: 'mdi-delete-empty-outline',
  //   title: 'Data Cleanup',
  //   path: '/clean',
  // },
]);

const bottom_items = ref([
  {
    icon: "mdi-information",
    title: "About",
    path: "/about",
  },
  {
    icon: "mdi-account-details",
    title: "Profile",
    path: "/profile",
  },
  {
    icon: "mdi-logout-variant",
    title: "Logout",
    path: "/auth/logout",
  },
]);

const admin_items = ref([]);
</script>

<style>
/* In minimized state, the default right margin is making the icons smaller */
aside.va-sidebar--minimized .va-sidebar__item__content > * {
  margin-right: 0;
}
</style>
