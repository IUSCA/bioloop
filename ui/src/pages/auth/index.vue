<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-300 dark:bg-gray-600"
  >
    <va-card class="w-full max-w-md">
      <va-card-content class="">
        <div class="flex flex-col gap-2 items-center justify-center opacity-90">
          <AppIcon size="3rem" />
          <AppTitle />
        </div>

        <div class="flex flex-col gap-2 items-center justify-center mt-6">
          <va-button
            :preset="isDark ? null : 'primary'"
            class="w-full py-1"
            @click="$router.push({ path: '/auth/iucas', query: $route.query })"
          >
            <span
              class="absolute left-0 top-0 flex items-center justify-center h-full w-10"
            >
              <IULogo />
            </span>
            <span class="font-semibold" data-testid="login-button"
              >Login with Indiana University</span
            >
          </va-button>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
const isDark = useDark();
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Auth
  requiresAuth: false
</route>
