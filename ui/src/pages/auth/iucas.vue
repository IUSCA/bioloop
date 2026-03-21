<template>
  <AuthStatus
    :get-url="authService.getCasUrl"
    :verify="auth.withHandledVerifyResponse(authService.casVerify)"
    :param-names="['ticket']"
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
  title: IU CAS Auth
  requiresAuth: false
</route>
