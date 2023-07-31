<template>
  <va-navbar>
    <template #left>
      <va-navbar-item>
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
      </va-navbar-item>
    </template>

    <template #right>
      <va-button-dropdown class="mr-2" preset="plain" size="large" icon="account_circle">
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

      <va-navbar-item v-for="(item, i) in navbar_items" :key="i">
        <va-list>
          <va-list-item :to="item.path">
            <va-list-item-section class="navbar-list-item-icon-container">
              <Icon :icon="item.icon" class="text-2xl" />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label>
                {{ item.title }}
              </va-list-item-label>
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>

      <va-navbar-item>
        <va-switch v-model="switchValue" :true-value=THEMES.DARK :false-value=THEMES.LIGHT size="small">
          <template #innerLabel>
            <div class="va-text-center">
              <va-icon size="24px" :name="switchValue === THEMES.DARK ? 'dark_mode' : 'light_mode'" />
            </div>
          </template>
        </va-switch>
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import { useColors } from "vuestic-ui";
import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import { stringToRGB } from "@/services/colors";

const auth = useAuthStore();
const { applyPreset, currentPresetName, colors } = useColors();

const profile = auth.user

const switchValue = computed({
  get() {
    return currentPresetName.value;
  },
  set(value) {
    applyPreset(value);
  },
});

watch([colors, switchValue], () => {
  console.log(`watch says: switchValue = ${switchValue.value}`)
  auth.setTheme({
    primary: colors.primary,
    mode: switchValue.value
  });
}, { deep: true })

const navbar_items = ref([
  {
    icon: "mdi-information",
    title: "About",
    path: "/about",
  },
  // {
  //   icon: "mdi-account-details",
  //   title: "Profile",
  //   path: "/profile",
  // },
  // {
  //   icon: "mdi-logout-variant",
  //   title: "Logout",
  //   path: "/auth/logout",
  // },
]);

const THEMES = {
  LIGHT: 'light',
  DARK: 'dark'
}

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

.navbar-list-item-icon-container {
  flex: none;
}
</style>