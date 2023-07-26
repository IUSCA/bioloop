<template>
  <va-navbar color="primary">
    <template #left>
      <va-navbar-item>
        <va-list>
          <va-list-item to="/">
            <va-list-item-section icon>
              <img class="w-12 h-12" src="/logo.svg" />
            </va-list-item-section>
            <va-list-item-section>
              <va-list-item-label class="text-3xl">
                {{ config.appTitle }}
              </va-list-item-label>
              <va-list-item-label v-if="auth.user?.username">
                Logged in as {{ auth.user.username }}
              </va-list-item-label>
            </va-list-item-section>
          </va-list-item>
        </va-list>
      </va-navbar-item>
    </template>

    <template #right>
      <va-navbar-item >
        Right slot
      </va-navbar-item>
    </template>
  </va-navbar>
</template>

<script setup>
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

</script>