<template>
  <va-sidebar
    :minimized="props.isSidebarCollapsed"
    class="pt-2"
    width="13rem"
    minimized-width="0"
  >
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
