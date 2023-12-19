<template>
  <div>
    <va-card>
      <va-card-content>
        <va-form class="grid grid-cols-2 gap-5">
          <va-input v-model="profile.username" label="Username" readonly />
          <va-input v-model="profile.name" label="Name" readonly />
          <va-input v-model="profile.email" label="Email" readonly />
          <va-input v-model="profile.cas_id" label="IU CAS ID" readonly />
        </va-form>
        <div>
          <h3 class="mt-3 pb-2 text-lg">Roles</h3>
          <div class="flex gap-3">
            <va-chip
              outline
              v-for="role in profile.roles"
              :key="role"
              class="flex-[0_0]"
            >
              {{ role }}
            </va-chip>
          </div>
        </div>
        <div class="mt-5">
          <va-divider />
          <span class="font-light">
            Your username, roles, and other attributes can only be updated by
            site administrators.
            <a class="va-link" :href="`mailto:${config.contact.app_admin}`"
              >Contact us</a
            >
            if one of these items needs to be updated.
          </span>
        </div>
      </va-card-content>
    </va-card>

    <!-- Color theme switcher -->
    <va-card class="mt-5">
      <va-card-content>
        <div class="flex flex-col gap-5">
          <div class="flex items-center gap-3">
            Primary color:
            <VaColorPalette
              v-model="colors.primary"
              :palette="palette"
              @update:model-value="persistTheme"
            />
          </div>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";
import { useColors } from "vuestic-ui";

const auth = useAuthStore();
const { colors } = useColors();

const palette = ["#154ec1", "#ef476f", "#ffd166", "#06d6a0", "#8338ec"];
const profile = auth.user;

function persistTheme() {
  auth.setTheme({
    primary: colors.primary,
  });
}
</script>

<route lang="yaml">
meta:
  title: Profile
  nav: [{ label: "Profile" }]
</route>
