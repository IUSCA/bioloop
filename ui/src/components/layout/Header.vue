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
            <va-list-item-section class="m-0" icon>
              <img class="w-7 h-7" src="/logo.svg" />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label>
                <h3 class="text-3xl m-0 hidden md:block">
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
        <!-- <span>Logged in as {{ auth.user.username }}</span> -->

        <va-dropdown>
          <template #anchor>
            <va-avatar :color="stringToRGB(auth.user.name || '')" size="small">
              <span class="text-sm uppercase">{{
                initials(auth.user.name)
              }}</span>
            </va-avatar>
          </template>
          <va-dropdown-content placement="auto" offset="10">
            <div class="space-y-1">
              <router-link class="flex gap-3 p-1 va-link" to="/profile">
                <div class="flex-none">
                  <Icon icon="mdi-account-details" class="text-2xl" />
                </div>
                <div>
                  <span class=""> Profile </span>
                </div>
              </router-link>

              <router-link class="flex gap-3 p-1 va-link" to="/auth/logout">
                <div class="flex-none">
                  <Icon icon="mdi-logout-variant" class="text-2xl" />
                </div>
                <div>
                  <span class=""> Logout </span>
                </div>
              </router-link>
            </div>
          </va-dropdown-content>
        </va-dropdown>
      </va-navbar-item>
      <va-navbar-item class="flex items-center">
        <ThemeToggle></ThemeToggle>
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import { stringToRGB } from "@/services/colors";
import { initials } from "@/services/utils";

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
</style>
