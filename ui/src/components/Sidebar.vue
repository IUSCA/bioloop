<template>
  <va-sidebar>
    <va-sidebar-item to="/">
      <va-list>
        <va-list-item>
          <va-list-item-section icon>
            <img class="w-12 h-12" src="/logo.svg" />
          </va-list-item-section>

          <va-list-item-section>
            <va-list-item-label class="text-3xl"> DGL-SCA </va-list-item-label>

            <va-list-item-label v-if="auth.user?.username">
              Logged in as {{ auth.user.username }}
            </va-list-item-label>
          </va-list-item-section>
        </va-list-item>
      </va-list>
    </va-sidebar-item>

    <va-divider />

    <va-sidebar-item
      v-for="(item, i) in user_items"
      :key="i"
      :to="item.path"
      :active="isActive(item.path)"
    >
      <va-sidebar-item-content>
        <Icon :icon="item.icon" class="text-2xl" />
        <!-- User can hide item with css if he wants -->
        <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
      </va-sidebar-item-content>
    </va-sidebar-item>

    <div v-if="isAdmin">
      <va-divider />
      <va-sidebar-item
        v-for="(item, i) in admin_items"
        :key="i"
        :to="item.path"
        :active="isActive(item.path)"
      >
        <va-sidebar-item-content>
          <Icon :icon="item.icon" class="text-2xl" />
          <!-- User can hide item with css if he wants -->
          <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
        </va-sidebar-item-content>
      </va-sidebar-item>
    </div>

    <va-divider />

    <va-sidebar-item
      v-for="(item, i) in bottom_items"
      :key="i"
      :to="item.path"
      :active="isActive(item.path)"
    >
      <va-sidebar-item-content>
        <Icon :icon="item.icon" class="text-2xl" />
        <!-- User can hide item with css if he wants -->
        <va-sidebar-item-title>{{ item.title }}</va-sidebar-item-title>
      </va-sidebar-item-content>
    </va-sidebar-item>
  </va-sidebar>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();

const isAdmin = ref(auth.hasRole("admin"));

function isActive(path) {
  return route.path.startsWith(path);
}

const user_items = ref([
  // {
  //   icon: "mdi-flask",
  //   title: "Projects",
  //   path: "/projects",
  // },
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

const admin_items = ref([
  // {
  //   icon: "mdi-monitor-dashboard",
  //   title: "Dashboard",
  //   path: "/",
  // },
  {
    icon: "mdi-dna",
    title: "Sequencing Runs",
    path: "/runs",
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
    icon: "mdi-table-account",
    title: "User Management",
    path: "/users",
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
  // {
  //   icon: "mdi-format-list-bulleted",
  //   title: "Stats/Tracking",
  //   path: "/stats",
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
</script>
