<template>
  <AuthStatus
    :get-url="authService.getMicrosoftUrl"
    :verify="auth.withHandledVerifyResponse(authService.microsoftVerify)"
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
  title: Microsoft Auth
  requiresAuth: false
</route>
