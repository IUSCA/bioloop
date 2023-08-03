<template>
  <va-navbar class="navbar-container flex-row">
    <template #left>      
      <va-button
        class="fixed top-0 left-0 rounded-none skip-to-content"
        href="#main">
        Skip to content
      </va-button>

      <va-navbar-item class="navbar-sidebar-toggle-container">
        <va-list>
          <va-list-item
          @keyup.enter="$emit('toggleSidebarVisibility')"
          >
            <va-list-item-section class="m-0" icon>
              <va-icon 
                @click="$emit('toggleSidebarVisibility')"
                size="3.5rem"
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
              <img class="w-12 h-12" src="/logo.svg" />
            </va-list-item-section>
            <va-list-item-section class="m-0 navbar-title">
              <va-list-item-label>
                <h3 class="text-3xl m-0 navbar-title-heading">
                  {{ config.appTitle }}
                </h3>
              </va-list-item-label>
              <va-list-item-label class="pl-0.5" v-if="auth.user?.username">
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
.navbar-title {
  --va-list-item-label-color: var(--va-text-primary);
}

.navbar-container .navbar-title {
  margin-left: 0;
}

.navbar-container .navbar-sidebar-toggle-container {
  margin-right: 0;
  padding-right: 0.7rem !important;
}

.navbar-container .va-navbar__right {
  justify-content: flex-end;
}

.navbar-title-container .va-list-item__inner {
  min-width: 11.86rem;
}

.navbar-title-heading {
  font-size: 2.7rem;
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