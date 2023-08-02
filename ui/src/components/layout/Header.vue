<template>
  <va-navbar class="navbar-container flex-row">
    <template #left>
      <va-navbar-item class="navbar-logo-container">
        <va-list>
          <va-list-item to="#">
            <va-list-item-section class="m-0" icon>
              <va-icon 
            size="2.8rem"
            :name="'menu' + (props.isSidebarCollapsed ? '_open' : '')"
             />
            </va-list-item-section>
        </va-list-item>
        </va-list>
      </va-navbar-item>
      
      <va-navbar-item class="ml-0 navbar-title-container">
        <va-list>
          <va-list-item to="/">
            <va-list-item-section class="m-0" icon>
              <img class="w-11 h-11" src="/logo.svg" />
            </va-list-item-section>
            <va-list-item-section class="m-0 navbar-title">
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

    <template #right>
      <va-navbar-item>
        <theme-toggle></theme-toggle>
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import ThemeToggle from '@/components/layout/ThemeToggle.vue'

const auth = useAuthStore();

const props = defineProps({
  isSidebarCollapsed: Boolean,
})
</script>

<style>
.navbar-container .navbar-logo-container {
  margin-right: 0;
  padding-right: 1rem !important;
}

.navbar-container .va-navbar__right {
  justify-content: flex-end;
}

.navbar-container .navbar-title {
  margin-left: 0;
}

.navbar-title-container .va-list-item__inner {
  min-width: 11.86rem;
}
</style>
