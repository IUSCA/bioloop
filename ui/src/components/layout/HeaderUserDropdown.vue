<template>
  <va-dropdown placement="bottom-end" :offset="10" stick-to-edges>
    <template #anchor>
      <div class="flex items-center gap-2">
        <UserAvatar :username="auth.user.username" :name="auth.user.name" />
        <div
          v-if="auth.isSpoofing"
          class="flex flex-col text-sm"
          role="status"
          data-testid="header-spoof-status"
        >
          <span class="font-semibold">Logging in as</span>
          <span data-testid="header-username">{{ auth.user.username }}</span>
        </div>
        <span v-else class="hidden md:inline" data-testid="header-username">
          {{ auth.user.username }}
        </span>
      </div>
    </template>
    <va-dropdown-content>
      <div class="min-w-[12rem] space-y-1 whitespace-nowrap">
        <router-link
          class="flex items-center gap-3 px-3 py-2 va-link"
          to="/profile"
        >
          <div class="flex-none">
            <Icon icon="mdi-account-details" class="text-2xl" />
          </div>
          <div>
            <span class=""> Profile </span>
          </div>
        </router-link>

        <button
          v-if="auth.isSpoofing"
          type="button"
          class="flex w-full items-center gap-3 px-3 py-2 text-left va-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
          @click="stopLoggingInAs"
        >
          <div class="flex-none">
            <Icon icon="mdi-logout-variant" class="text-2xl" />
          </div>
          <span>Stop logging in as</span>
        </button>

        <router-link
          v-else
          class="flex items-center gap-3 px-3 py-2 va-link"
          to="/auth/logout"
        >
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

function stopLoggingInAs() {
  if (auth.isSpoofing) auth.logout();
}
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
