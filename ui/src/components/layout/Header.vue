<template>
  <va-navbar class="navbar-container flex-row shadow-lg">
    <template #left>
      <va-button
        class="fixed top-0 left-0 rounded-none font-normal skip-to-content"
        href="#main"
      >
        Skip to content
      </va-button>

      <va-navbar-item class="">
        <va-list>
          <va-list-item @keyup.enter="$emit('toggleSidebarVisibility')">
            <va-list-item-section class="m-0" icon>
              <va-icon
                @click="$emit('toggleSidebarVisibility')"
                :name="'menu' + (props.isSidebarCollapsed ? '_open' : '')"
              />
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>

      <va-navbar-item>
        <router-link to="/">
          <div class="flex flex-row flex-nowrap gap-2 items-center">
            <div class="hidden md:block">
              <AppIcon />
            </div>
            <div>
              <AppTitle />
            </div>
          </div>
        </router-link>
      </va-navbar-item>
    </template>

    <template #right>
      <va-navbar-item class="flex items-center">
        <env-alert icon="warning" />
      </va-navbar-item>
      <va-navbar-item class="flex items-center" v-if="auth.user?.username">
        <HeaderUserDropdown />
      </va-navbar-item>
      <va-navbar-item class="flex items-center" v-if="areNotificationsEnabled">
        <NotificationDropdown />
      </va-navbar-item>
      <va-navbar-item class="flex items-center">
        <ThemeToggle />
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import config from "@/config";
import { storeToRefs } from "pinia";

const auth = useAuthStore();

const { hasRole } = auth;

const props = defineProps({
  isSidebarCollapsed: Boolean,
});

const areNotificationsEnabled = computed(() => {
  return config.enabledFeatures.notifications.enabledForRoles.some((role) =>
    hasRole(role),
  );
});
</script>

<style>
.navbar-container {
  --va-navbar-padding-y: 0.6rem;
  --va-navbar-mobile-height: 4rem;
}

.navbar-container .va-navbar__left {
  align-items: center;
  justify-content: start;
}

.navbar-container .va-navbar__right {
  justify-content: flex-end;
}

/* Skip link */
.skip-to-content {
  transform: translateY(-100%);
  transition: transform 0.3s;
}

.skip-to-content:focus {
  transform: translateY(0%);
}

.title-text {
  transition: font-size 0.3s;
}

.navbar-title-heading {
  font-size: 2.7rem;
}

@media all and (min-width: 1024px) {
  .navbar-title-heading {
    font-size: 2.7rem;
  }
}

@media all and (max-width: 1024px) {
  .navbar-title-heading {
    line-height: 1.875rem;
  }
}
</style>
