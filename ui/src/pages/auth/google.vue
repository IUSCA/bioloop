<template>
  <AuthStatus
    :get-url="authService.getGoogleUrl"
    :verify="auth.withHandledVerifyResponse(authService.googleVerify)"
    :param-names="['code', 'state']"
  />
</template>

<script setup>
import authService from "@/services/auth";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Google Auth
  requiresAuth: false
</route>
