<template>
  <va-dropdown>
    <template #anchor>
      <div class="flex items-center gap-2">
        <UserAvatar :username="auth.user.username" :name="auth.user.name" />
        <span class="hidden md:inline" data-testid="header-username">
          {{ auth.user.username }}
        </span>
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
