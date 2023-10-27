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
          <div class="text-center mt-8">
            <span class="text-xl tracking-wide font-medium">
              Log In / Sign Up
            </span>
          </div>
          <div class="mt-2 mb-8">
            <va-divider />
          </div>
          <div class="flex justify-between px-8 mb-3">
            <va-button
              class="py-1"
              preset="primary"
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
          <div class="flex justify-between px-8 mb-3">
            <va-button
              class="py-1"
              preset="primary"
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
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup></script>

<route lang="yaml">
meta:
  layout: auth
  title: Auth
  requiresAuth: false
</route>
