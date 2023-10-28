<template>
  <AuthStatus
    :get-url="authService.getCiUrl"
    :verify="auth.ciLogin"
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
  title: CI Logon Auth
  requiresAuth: false
</route>
