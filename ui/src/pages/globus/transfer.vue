<template>Globus Authentication succeeded</template>

<script setup>
// const router = useRouter();
import globusService from "@/services/globusAuth";
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
// const route = useRoute();
const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));

// route.
// const queryParams = route.params;

onMounted(() => {
  console.log("Auth code", globusAuthCode.value);
  globusService
    .getToken({
      grant_type: "authorization_code",
      code: globusAuthCode.value,
      redirect_uri: config.globus.redirect_uri,
    })
    .then((res) => {
      console.log("Globus Auth Response token:", res.data.access_token);
      auth.setGlobusAccessToken(res.data.access_token);
    })
    .catch((err) => {
      console.error("Globus Auth Error:", err);
      // todo - redirect to error page
    });
});
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Globus Transfers
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Globus Transfers" }]
</route>
