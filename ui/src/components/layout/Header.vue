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
        <va-list>
          <va-list-item to="/">
            <va-list-item-section class="m-0 hidden md:block" icon>
              <AppIcon />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label>
                <h3
                  class="text-3xl m-0 lowercase font-[audiowide] text-slate-700 dark:text-slate-300"
                >
                  {{ config.appTitle }}
                </h3>
              </va-list-item-label>
              <!-- <va-list-item-label class="pl-0.5" v-if="auth.user?.username">
                Logged in as {{ auth.user.username }}
              </va-list-item-label> -->
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>
    </template>

    <template #right>
      <va-navbar-item class="flex items-center" v-if="auth.user?.username">
        <HeaderUserDropdown />
        <!-- <span>Logged in as {{ auth.user.username }}</span> -->
      </va-navbar-item>
      <va-navbar-item class="flex items-center">
        <ThemeToggle />
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const props = defineProps({
  isSidebarCollapsed: Boolean,
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
