<template>
  <va-button-dropdown class="mr-2 profile-dropdown-list" preset="plain" size="large" icon="account_circle">
    <va-list>
      <va-list-item to="/profile" class="navbar-dropdown-profile-list-item">
        <va-list-item-section avatar>
          <va-avatar :color="stringToRGB(profile.name || '')" size="small">
            <span class="text-sm uppercase">{{ initials(profile.name) }}</span>
          </va-avatar>
        </va-list-item-section>

        <va-list-item-section>
          <va-list-item-label>
            {{ profile.name }}
          </va-list-item-label>

          <va-list-item-label caption>
            {{ profile.email }}
          </va-list-item-label>
        </va-list-item-section>
      </va-list-item>

      <va-list-item class="navbar-dropdown-profile-list-item" to="/auth/logout">
        <va-list-item-section icon>
          <Icon icon="mdi-logout-variant" class="text-2xl" />
        </va-list-item-section>
        <va-list-item-section>
          <va-list-item-label>
            Logout
          </va-list-item-label>
        </va-list-item-section>
      </va-list-item>
    </va-list>
  </va-button-dropdown>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import { stringToRGB } from "@/services/colors";

const auth = useAuthStore();
const profile = auth.user

function initials(name) {
  const parts = (name || "").split(" ");
  if (parts.length == 1) return parts[0][0];
  else {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }
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