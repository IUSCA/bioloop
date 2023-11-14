<template>
  <div class="flex justify-center">
    <div class="max-w-md">
      <va-card class="mt-10 lg:mt-20" stripe stripe-color="success">
        <va-card-content>
          <div class="flex justify-center opacity-90">
            <div class="flex flex-col gap-2 items-center">
              <AppIcon size="3rem" />
              <AppTitle />
            </div>
          </div>
          <!-- <div class="text-center mt-8">
            <span class="text-xl tracking-wide font-medium">
              Log In / Sign Up
            </span>
          </div> -->
          <div class="mt-2 mb-8">
            <va-divider />
          </div>

          <!-- IU CAS -->
          <div class="flex justify-between px-8 mb-3">
            <va-button
              class="py-1"
              preset="secondary"
              border-color="secondary"
              @click="
                $router.push({ path: '/auth/iucas', query: $route.query })
              "
            >
              <div class="flex justify-between items-center gap-3 w-full">
                <img
                  src="@/assets/Indiana_Hoosiers_logo.svg"
                  class="h-6"
                  loading="lazy"
                  alt="IU logo"
                />
                <span class="dark:text-slate-100">
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
              class="py-1"
              preset="secondary"
              border-color="secondary"
              @click="
                $router.push({ path: '/auth/google', query: $route.query })
              "
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
              class="py-1"
              preset="secondary"
              border-color="secondary"
              @click="$router.push({ path: '/auth/cil', query: $route.query })"
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
        </va-card-content>
      </va-card>
    </div>
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
