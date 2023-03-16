<template>
  <h2 class="text-4xl font-bold">Profile</h2>
  <div>
    <div class="py-3"></div>
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
            <a class="va-link" :href="`mailto:${config.contact.dgl_admin}`"
              >Contact us</a
            >
            if one of these items needs to be updated.
          </span>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import config from "@/config";

const auth = useAuthStore();

const profile = auth.user;
</script>
