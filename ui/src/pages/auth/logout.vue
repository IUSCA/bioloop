<template>
  <div class="flex justify-center">
    <div class="max-w-md">
      <va-card class="mt-10 lg:mt-20">
        <va-card-content>
          <div class="flex justify-center opacity-70">
            <div class="flex flex-col gap-2 items-center">
              <img class="h-12" src="/logo.svg" />
              <span class="text-3xl tracking-wide">
                {{ config.appTitle }}
              </span>
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
import config from "@/config";
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();

auth.logout();
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Logout
  requiresAuth: false
</route>
