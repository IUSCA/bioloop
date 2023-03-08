<template>
  <div class="max-w-lg" v-if="notAuthorized">
    <va-card>
      <va-card-content>
        <div class="text-xl text-gray-700">
          It appears that you do not currently have permission to access this
          application. If you require access, please send a message to
          <a class="va-link" :href="`mailto:${config.contact.dgl_admin}`">{{
            config.contact.dgl_admin
          }}</a>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import config from "../../config";
import { useAuthStore } from "../../stores/auth";
import authService from "../../services/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const redirectPath = ref(useLocalStorage("auth.redirect", ""));
const notAuthorized = ref(false);

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
      console.log(
        "User was authenticated with CAS but they are not a portal user"
      );
      notAuthorized.value = true;
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
  title: IU CAS Auth
  requiresAuth: false
</route>
