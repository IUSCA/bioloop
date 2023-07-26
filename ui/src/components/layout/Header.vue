<template>
  <va-navbar>
    <template #left>
      <va-navbar-item>
        <va-list>
          <va-list-item to="/">
            <va-list-item-section icon>
              <img class="w-12 h-12" src="/logo.svg" />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label class="text-3xl">
                {{ config.appTitle }}
              </va-list-item-label>
              <va-list-item-label v-if="auth.user?.username">
                Logged in as {{ auth.user.username }}
              </va-list-item-label>
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>
    </template>

    <!-- TODO - isActive method is missing. -->
    <template #right>
      <va-navbar-item
        v-for="(item, i) in navbar_items"
        :key="i">
        <va-list>
          <va-list-item
           :to="item.path"
           >
            <va-list-item-section class="navbar-list-item-icon-container">
              <Icon :icon="item.icon" class="text-2xl" />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label>
                {{ item.title }}
              </va-list-item-label>
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>  
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const navbar_items = ref([
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

<style>
.navbar-list-item-icon-container {
  flex: none;
}
</style>