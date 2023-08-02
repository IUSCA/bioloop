<template>
  <va-navbar class="navbar-container">
    <template #left>
      <va-navbar-item class="logo-container">
        <div
          role="button"
          aria-label="to be decided"
          @click="$emit('toggleSidebarVisibility')">
          <va-icon 
            size="2.8rem"
            :name="'menu' + (props.isSidebarCollapsed ? '_open' : '')"
             />
        </div>
      </va-navbar-item>
      
      <va-navbar-item class="ml-0 navbar-right-container">
        <va-list>
          <va-list-item to="/">
            <va-list-item-section class="m-0" icon>
              <img class="w-11 h-11" src="/logo.svg" />
            </va-list-item-section>
            <va-list-item-section class="m-0 title-container">
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
        <dark-mode></dark-mode>
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import DarkMode from '@/components/layout/DarkMode.vue'

const auth = useAuthStore();

const props = defineProps({
  isSidebarCollapsed: Boolean,
  // isMobileNavVisible: Boolean
})

// const isSidebarCollapsed = ref(false)

// const toggleSidebarVisibility = () => {
//   isSidebarCollapsed.value = !isSidebarCollapsed.value
// }



</script>

<style>
.logo-container {
  margin-right: 0 !important;
  padding-right: 1rem;
}

.navbar-container {
  flex-direction: row;
}

.navbar-container .va-navbar__right {
  justify-content: end;
}

.navbar-right-container .va-list-item__inner {
  min-width: 11.86rem;
}

.navbar-container .title-container {
  margin-left: 0;
}
</style>
