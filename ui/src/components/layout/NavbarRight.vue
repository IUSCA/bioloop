<template>
        <va-navbar-item>
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
      </va-navbar-item>

      <va-navbar-item>
        <va-list>
          <va-list-item to="/about">
            <va-list-item-section class="navbar-list-item-icon-container">
              <Icon icon="mdi-information" class="text-2xl" />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label>
                About
              </va-list-item-label>
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>

      <va-navbar-item>
        <va-switch 
          v-model="switchValue"
          :true-value=THEMES.DARK
          :false-value=THEMES.LIGHT 
          size="small">
          <template #innerLabel>
            <div class="va-text-center">
              <va-icon
                size="24px" 
                :name="switchValue === THEMES.DARK ? 'dark_mode' : 
                  'light_mode'"
              />
            </div>
          </template>
        </va-switch>
      </va-navbar-item>
</template>

<script setup>
import { computed } from "vue";
import { useColors } from "vuestic-ui";
import { stringToRGB } from "@/services/colors";
import { useAuthStore } from "@/stores/auth";

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
  // console.log(`watch says: switchValue = ${switchValue.value}`)
  auth.setTheme({
    primary: colors.primary,
    mode: switchValue.value
  });
}, { deep: true })

function initials(name) {
  const parts = (name || "").split(" ");
  if (parts.length == 1) return parts[0][0];
  else {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }
}

const THEMES = {
  LIGHT: 'light',
  DARK: 'dark'
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