<template>
  <va-dropdown>
    <template #anchor>
      <div class="flex items-center gap-2">
        <va-avatar :color="stringToRGB(auth.user.name || '')" size="small">
          <span class="text-sm uppercase">{{ initials(auth.user.name) }}</span>
        </va-avatar>
        <span class="hidden md:inline"> {{ auth.user.username }} </span>
      </div>
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
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import { stringToRGB } from "@/services/colors";
import { initials } from "@/services/utils";

const auth = useAuthStore();
</script>

<style>
.navbar-dropdown-profile-list-item .va-list-item-section--icon {
  --va-list-item-section-icon-margin: 0.6rem 1.5rem 0.6rem 0;
}

.navbar-dropdown-profile-list-item .va-list-item-section--main {
  margin: 0.6rem 0.75rem 0.6rem 0;
}

.profile-dropdown-list {
  padding-bottom: 0.075rem;
}
</style>
