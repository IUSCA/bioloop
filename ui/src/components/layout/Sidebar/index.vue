<template>
  <va-sidebar
    :minimized="props.isSidebarCollapsed"
    class="pt-2"
    width="13rem"
    minimizedWidth="0"
  >
    <!-- user sidebar items -->
    <div v-if="user_items.length > 0">
      <SidebarItems :items="user_items" :isActive="isActive" />
      <va-divider />
    </div>

    <!-- operator sidebar items -->
    <div v-if="auth.canOperate && operator_items.length > 0">
      <SidebarItems :items="operator_items" :isActive="isActive" />
      <va-divider />
    </div>

    <!-- admin sidebar items   -->
    <div v-if="auth.canAdmin && admin_items.length > 0">
      <SidebarItems :items="admin_items" :isActive="isActive" />
      <va-divider />
    </div>

    <!-- other sidebar items   -->
    <div v-if="bottom_items.length > 0">
      <SidebarItems :items="bottom_items" :isActive="isActive" />
    </div>
  </va-sidebar>
</template>

<script setup>
import config from "@/config";
import constants from "@/constants";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { storeToRefs } from "pinia";

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

function isActive(path) {
  /**
   * This function is executed for every sidebar item rendered
   * If the return value is true, that item is highlighted
   * path is from the sidebar item config
   * route.path is the actual path in the browser URL
   *
   * Since paths of all components start with '/',
   * dashboard requires a special check All types of datasets use the same
   * /datasets/ prefix, these require special handling
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
</script>

<style>
/* In minimized state, the default right margin is making the icons smaller */
aside.va-sidebar--minimized .va-sidebar__item__content > * {
  margin-right: 0;
}
</style>
