<template>
  <span></span>
</template>

<script setup>
import config from "../config";
import { useAuthStore } from "../stores/auth";
import authService from "../services/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const redirectPath = ref(useLocalStorage("auth.redirect", ""));

const ticket = route.query.ticket;
if (ticket) {
  auth.casLogin(ticket).then((user) => {
    if (user) {
      // read redirectPath value from local storage and reset it
      const _redirectPath = redirectPath.value;
      redirectPath.value = "";
      router.push({
        path: _redirectPath || "/",
      });
    } else {
      // User was authenticated with CAS but they are not a portal user
      // TODO:
      console.log(
        "User was authenticated with CAS but they are not a portal user"
      );
    }
  });
} else {
  if (route.query.redirect_to) {
    redirectPath.value = route.query.redirect_to;
  }

  authService
    .getCasUrl(config.casReturn)
    .then((res) => {
      const casUrl = res.data?.url;
      if (casUrl) {
        window.location.replace(casUrl);
      }
    })
    .catch((err) => {
      console.error(err);
    });
}

// window.location.replace()
</script>

<route lang="yaml">
meta:
  layout: auth
  title: Auth
  requiresAuth: false
</route>
