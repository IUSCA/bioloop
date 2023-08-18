<template>
  <div class="flex justify-center">
    <div class="max-w-md">
      <va-card class="mt-10 lg:mt-20">
        <va-card-content>
          <div class="flex justify-center opacity-90">
            <div class="flex flex-col gap-2 items-center">
              <AppIcon size="3rem" />
              <AppTitle />
            </div>
          </div>
          <div class="text-center mt-8 text-xl">
            <span>You have been logged out of the application.</span>
          </div>
          <div class="text-center mt-4">
            <va-button to="/auth">Log In</va-button>
          </div>
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

auth.logout();
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Logout
  requiresAuth: false
</route>
