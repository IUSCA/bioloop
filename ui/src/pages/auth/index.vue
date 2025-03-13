<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-300 dark:bg-gray-600"
  >
    <va-card class="w-full max-w-md">
      <va-card-content>
        <div class="flex flex-col gap-2 items-center justify-center opacity-90">
          <!-- <env-alert class="w-full" icon="warning" /> -->

          <AppIcon size="3rem" />
          <AppTitle />
        </div>

        <div class="mt-2 mb-4">
          <va-divider />
        </div>

        <!-- IU CAS -->
        <div class="flex justify-center px-8 mb-3"
          v-if="config.auth_enabled.iucas">
          <va-button
            class="flex-auto py-1"
            preset="secondary"
            border-color="secondary"
            @click="$router.push({ path: '/auth/iucas', query: $route.query })"
          >
            <div class="flex justify-between items-center gap-3 w-full">
              <img
                src="@/assets/Indiana_Hoosiers_logo.svg"
                class="h-6"
                loading="lazy"
                alt="IU logo"
              />
              <span class="dark:text-slate-100" data-testid="login-button">
                Login with Indiana University
              </span>
            </div>
          </va-button>
        </div>

        <!-- Google -->
        <div
          class="flex justify-between px-8 mb-3"
          v-if="config.auth_enabled.google"
        >
          <va-button
            class="flex-auto py-1"
            preset="secondary"
            border-color="secondary"
            @click="$router.push({ path: '/auth/google', query: $route.query })"
          >
            <div class="flex justify-center items-center gap-3 w-full">
              <img
                class="w-6 h-6"
                src="@/assets/google-color.svg"
                loading="lazy"
                alt="google logo"
              />
              <span class="dark:text-slate-100"> Login with Google </span>
            </div>
          </va-button>
        </div>

        <!-- CI Logon -->
        <div
          class="flex justify-between px-8 mb-3"
          v-if="config.auth_enabled.cilogon"
        >
          <va-button
            class="flex-auto py-1"
            preset="secondary"
            border-color="secondary"
            @click="$router.push({ path: '/auth/cilogon', query: $route.query })"
          >
            <div class="flex justify-center items-center gap-3 w-full">
              <img
                class="w-7 h-7"
                src="@/assets/CILogon-icon.png"
                loading="lazy"
                alt="CILogon logo"
              />
              <span class="dark:text-slate-100"> Login with CILogon </span>
            </div>
          </va-button>
        </div>

        <!-- Microsoft -->
        <div
          class="flex justify-between px-8 mb-3"
          v-if="config.auth_enabled.microsoft"
        >
          <va-button
            class="flex-auto py-1"
            preset="secondary"
            border-color="secondary"
            @click="
              $router.push({ path: '/auth/microsoft', query: $route.query })
            "
          >
            <div class="flex justify-center items-center gap-3 w-full">
              <img
                class="w-6 h-6"
                src="@/assets/microsoft-icon.svg"
                loading="lazy"
                alt="microsoft logo"
              />
              <span class="dark:text-slate-100"> Login with Microsoft </span>
            </div>
          </va-button>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import config from "@/config";
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Auth
  requiresAuth: false
</route>
