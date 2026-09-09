<template>
  <div class="flex flex-col items-center justify-center gap-3 p-8">
    <h1 class="text-xl font-semibold">Development login</h1>
    <p class="text-sm opacity-70">{{ status }}</p>
    <p v-if="failed" class="text-xs opacity-60">
      Pass a username as <code>?username=…</code>. Defaults to
      <code>test_user</code>.
    </p>
  </div>
</template>

<script setup>
// Signs in as any seeded user without going through CAS, so that a developer or an agent
// driving a browser can reach authenticated pages and switch between roles:
//
//   /dev-login                     -> test_user, a platform admin
//   /dev-login?username=user-013   -> an ordinary member of a seeded group
//
// The API route this calls, POST /auth/test_login, is not registered when the API's env is
// production or test, so this page cannot sign anybody in outside development. The page
// also refuses to act unless Vite is running in dev mode.
//
// @see docs/guides/dev-servers.md — Logging in without CAS
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const status = ref("Signing in…");
const failed = ref(false);

onMounted(async () => {
  if (!import.meta.env.DEV) {
    status.value = "Development login is unavailable in this build.";
    failed.value = true;
    return;
  }
  const username = route.query.username || "test_user";
  try {
    const { data } = await api.post("/auth/test_login", { username });
    auth.onLogin(data);
    // The real providers apply a held invitation through `withHandledVerifyResponse`, which
    // this page does not go through. Without this line the signed-out half of the invitation
    // flow cannot be exercised in development at all, which is how it went unnoticed.
    await auth.applyHeldInvite();
    const roles = data.profile.roles?.join(", ") || "no roles";
    status.value = `Signed in as ${data.profile.username} (${roles}). Redirecting…`;
    router.push(route.query.next || "/v2/groups");
  } catch (err) {
    failed.value = true;
    status.value = `Could not sign in as "${username}": ${
      err?.response?.data?.message || err.message
    }`;
  }
});
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Development Login
  requiresAuth: false
</route>
