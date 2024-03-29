<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-300 dark:bg-gray-600"
  >
    <va-card class="w-full max-w-md" v-if="notAuthorized || authFailure">
      <va-card-content>
        <div
          class="text-lg flex flex-col items-center gap-5 text-center"
          v-if="notAuthorized"
        >
          <i-mdi-alert class="text-amber-600 text-5xl" />
          <span>
            It appears that you do not currently have permission to access this
            application. If you require access, please send a message to
            <a class="va-link" :href="`mailto:${config.contact.app_admin}`">{{
              config.contact.app_admin
            }}</a>
          </span>
        </div>
        <div
          class="text-lg text-gray-700 flex flex-col items-center gap-5 text-center"
          v-if="authFailure"
        >
          <i-mdi-alert-octagon class="text-red-600 text-5xl" />
          <span class="va-text-text-primary"
            >Authentication Failed. Something went wrong.</span
          >
          <div>
            <va-button to="/auth">Try Again</va-button>
          </div>
        </div>
      </va-card-content>
    </va-card>

    <va-card class="w-full max-w-md" v-if="validation_loading">
      <va-card-content class="flex items-center gap-2 justify-center">
        <!-- <va-inner-loading loading class="col-span-1" /> -->
        <span class="text-2xl tracking-wide flex-none"> Logging in </span>
        <fingerprint-spinner
          class="flex-none"
          :animation-duration="2000"
          :dot-size="10"
          :dots-num="3"
          :color="colors.primary"
        />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import { FingerprintSpinner } from "epic-spinners";
import { useColors } from "vuestic-ui";
const { colors } = useColors();

import config from "@/config";
import authService from "@/services/auth";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const redirectPath = ref(useLocalStorage("auth.redirect", ""));
const notAuthorized = ref(false);
const authFailure = ref(false);
const validation_loading = ref(false);

const ticket = route.query.ticket;
if (ticket) {
  validation_loading.value = true;
  auth
    .casLogin(ticket)
    .then((user) => {
      if (user) {
        // read redirectPath value from local storage and reset it
        const _redirectPath = redirectPath.value;
        redirectPath.value = "";
        router.push({
          path: _redirectPath || "/",
        });
        // notAuthorized.value = true;
      } else {
        // User was authenticated with CAS but they are not a portal user
        console.log(
          "User was authenticated with CAS but they are not a portal user",
        );
        notAuthorized.value = true;
      }
    })
    .catch((err) => {
      authFailure.value = true;
      console.error(err);
    })
    .finally(() => {
      validation_loading.value = false;
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
      } else {
        authFailure.value = true;
      }
    })
    .catch((err) => {
      console.error(err);
      authFailure.value = true;
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
