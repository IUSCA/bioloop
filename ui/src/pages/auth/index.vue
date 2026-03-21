<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-300 dark:bg-gray-600"
  >
    <va-card class="w-full max-w-sm">
      <va-card-content>
        <div class="flex flex-col gap-2 items-center justify-center opacity-90">
          <!-- <env-alert class="w-full" icon="warning" /> -->

          <AppIcon size="3rem" />
          <AppTitle />
        </div>

        <div class="mt-2 mb-6">
          <va-divider />
        </div>

        <p
          class="w-full text-center text-xl font-semibold mb-4 tracking-normal"
        >
          <span v-if="auth.isFeatureEnabled('signup')">
            Sign Up or Log In
          </span>
          <span v-else>Log In with</span>
        </p>

        <!-- IU CAS -->
        <div class="flex justify-center px-8 mb-3">
          <va-button
            class=""
            preset="secondary"
            border-color="secondary"
            @click="$router.push({ path: '/auth/iucas', query: $route.query })"
          >
            <template #prepend>
              <img
                src="@/assets/Indiana_Hoosiers_logo.svg"
                class="h-6 ml-3"
                loading="lazy"
                alt="IU logo"
              />
            </template>
            <div class="flex justify-center items-center gap-3 w-[16rem]">
              <p
                class="dark:text-slate-100 text-base"
                data-testid="login-button"
              >
                Indiana University
              </p>
            </div>
          </va-button>
        </div>

        <!-- Google -->
        <div
          class="flex justify-between px-8 mb-3"
          v-if="config.auth_enabled.google"
        >
          <va-button
            class=""
            preset="secondary"
            border-color="secondary"
            @click="$router.push({ path: '/auth/google', query: $route.query })"
          >
            <template #prepend>
              <img
                class="w-6 h-6 ml-3"
                src="@/assets/google-color.svg"
                loading="lazy"
                alt="google logo"
              />
            </template>
            <div class="flex justify-center items-center gap-3 w-[16rem]">
              <span class="dark:text-slate-100 text-base">
                Continue with Google
              </span>
            </div>
          </va-button>
        </div>

        <!-- CI Logon -->
        <div
          class="flex justify-between px-8 mb-3"
          v-if="config.auth_enabled.cilogon"
        >
          <va-button
            class=""
            preset="secondary"
            border-color="secondary"
            @click="$router.push({ path: '/auth/cil', query: $route.query })"
          >
            <template #prepend>
              <img
                class="w-6 h-6 ml-3"
                src="@/assets/CILogon-icon.png"
                loading="lazy"
                alt="CILogon logo"
              />
            </template>
            <div class="flex justify-center items-center gap-3 w-[16rem]">
              <span class="dark:text-slate-100 text-base">
                Continue with CILogon
              </span>
            </div>
          </va-button>
        </div>

        <!-- Microsoft -->
        <div
          class="flex justify-between px-8 mb-3"
          v-if="config.auth_enabled.microsoft"
        >
          <va-button
            class=""
            preset="secondary"
            border-color="secondary"
            @click="
              $router.push({ path: '/auth/microsoft', query: $route.query })
            "
          >
            <template #prepend>
              <img
                class="w-6 h-6 ml-3"
                src="@/assets/microsoft-icon.svg"
                loading="lazy"
                alt="microsoft logo"
              />
            </template>
            <div class="flex justify-center items-center gap-3 w-[16rem]">
              <span class="dark:text-slate-100 text-base">
                Continue with Microsoft
              </span>
            </div>
          </va-button>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Auth
  requiresAuth: false
</route>
