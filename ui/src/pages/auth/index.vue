<template>
  <div class="flex justify-center">
    <div class="max-w-md">
      <va-card class="mt-10 lg:mt-20" stripe stripe-color="success">
        <va-card-content>
          <div class="flex justify-center opacity-70">
            <div class="flex flex-col gap-2 items-center">
              <img class="h-12" src="/logo.svg" />
              <span class="text-3xl tracking-wide"> DGL-SCA </span>
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
          <div class="flex justify-between px-8 mb-2">
            <va-button to="/auth/iucas" class="py-2">
              <span class="text-lg font-medium"
                >Continue with Indiana University</span
              >
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
