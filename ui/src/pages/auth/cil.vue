<template>
  <AuthStatus
    :get-url="authService.getCiUrl"
    :verify="auth.withHandledVerifyResponse(authService.ciVerify)"
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
  title: CI Logon Auth
  requiresAuth: false
</route>
