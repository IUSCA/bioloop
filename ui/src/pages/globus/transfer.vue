<template>
  <va-button @click="submitTask">Start Transfer</va-button>
</template>

<script setup>
// const router = useRouter();
import globusService from "@/services/globus/globusAuth";
import globusTransferService from "@/services/globus/globusTransfer";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
// const route = useRoute();
const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));

const submitTask = () => {
  globusTransferService
    .submitTask()
    .then((res) => {
      console.log("Task submitted successfully:", res.data);
      // router.push("/globus/transfers");
    })
    .catch((err) => {
      console.error("Task submission failed:", err);
    });
};

onMounted(() => {
  console.log("Auth code", globusAuthCode.value);
  globusService
    .getToken({
      // grant_type: "authorization_code",
      code: globusAuthCode.value,
      // redirect_uri: config.globus.redirect_uri,
    })
    .then((res) => {
      console.log("Globus Auth Response token:", res.data.access_token);
      auth.setGlobusAccessToken(res.data.access_token);
      globusAuthCode.value = "";
      // console.log("Globus Auth Code is now:", globusAuthCode.value);
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
