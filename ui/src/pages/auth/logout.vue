<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-gray-300 dark:bg-gray-600"
  >
    <va-card class="w-full max-w-md">
      <va-card-content class="px-9">
        <div class="flex flex-col gap-2 items-center justify-center opacity-90">
          <AppIcon size="3rem" />
          <AppTitle />
        </div>
        <div class="text-center mt-6 text-xl">
          <span>You have been logged out of the application.</span>
        </div>
        <div class="text-center mt-6">
          <va-button to="/auth">Log In</va-button>
        </div>
      </va-card-content>
    </va-card>
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
