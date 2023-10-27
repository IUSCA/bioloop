<template>
  <AuthStatus
    :get-url="authService.getGoogleUrl"
    :verify="auth.googleLogin"
    :param-names="['code', 'state']"
  />
</template>

<script setup>
import { useAuthStore } from "@/stores/auth";
import authService from "@/services/auth";

const auth = useAuthStore();
</script>

<route lang="yaml">
meta:
  layout: auth
  title: IU CAS Auth
  requiresAuth: false
</route>
