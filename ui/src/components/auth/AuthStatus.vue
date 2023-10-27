<template>
  <div class="flex justify-center items-center h-full">
    <div class="max-w-lg" v-if="notAuthorized || authFailure">
      <va-card>
        <va-card-content>
          <div
            class="text-xl flex flex-col items-center gap-5"
            v-if="notAuthorized"
          >
            <i-mdi-alert class="text-amber-600 text-5xl" />
            <span>
              It appears that you do not currently have permission to access
              this application. If you require access, please send a message to
              <a class="va-link" :href="`mailto:${config.contact.app_admin}`">{{
                config.contact.app_admin
              }}</a>
            </span>
          </div>
          <div
            class="text-xl text-gray-700 flex flex-col items-center gap-5"
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
    </div>
    <div v-if="loading" class="max-w-lg">
      <va-card>
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
  </div>
</template>

<script setup>
import { FingerprintSpinner } from "epic-spinners";
import { useColors } from "vuestic-ui";
const { colors } = useColors();

import config from "@/config";

const route = useRoute();
const router = useRouter();
const redirectPath = ref(useLocalStorage("auth.redirect", ""));
const notAuthorized = ref(false);
const authFailure = ref(false);
const loading = ref(false);

const props = defineProps(["getUrl", "verify", "paramNames"]);

const params = props.paramNames.reduce((acc, curr) => {
  acc[curr] = route.query[curr];
  return acc;
}, {});

const paramsExist = Object.values(params).every((x) => x);

if (paramsExist) {
  loading.value = true;
  props
    .verify(params)
    .then((user) => {
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
      loading.value = false;
    });
} else {
  props
    .getUrl()
    .then((res) => {
      const url = res.data?.url;
      if (url) {
        window.location.replace(url);
      } else {
        authFailure.value = true;
      }
    })
    .catch((err) => {
      console.error(err);
      authFailure.value = true;
    });
}
</script>
