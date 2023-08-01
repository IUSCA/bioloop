<template>
  <va-navbar>
    <template #left>
      <!-- <va-navbar-item> -->
        <div
          role="button"
          aria-label="to be decided"
          tabindex="0"
          @click="$emit('toggleSidebarVisibility')">
          <va-icon :name="'menu' + (props.isSidebarCollapsed ? '_open' : '')" />
        </div>
      <!-- </va-navbar-item> -->
      
      <!-- <va-navbar-item> -->
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
      <!-- </va-navbar-item> -->
    </template>

    <template #right>
      <navbar-right></navbar-right>
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import NavbarRight from '@/components/layout/NavbarRight.vue'

const auth = useAuthStore();

const props = defineProps({isSidebarCollapsed: Boolean})

// const isSidebarCollapsed = ref(false)

// const toggleSidebarVisibility = () => {
//   isSidebarCollapsed.value = !isSidebarCollapsed.value
// }



</script>

