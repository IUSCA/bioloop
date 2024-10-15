<script setup>
import config from "@/config";
import { lxor } from "@/services/utils";
import { v4 as uuidv4 } from "uuid";
import { redirectToGlobusAuth } from "@/services/globus";
import GlobusAuthService from "@/services/globus/auth";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));
const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));
// const queryParams = route.params;

onMounted(() => {
  // reset code if already exists in local storage
  globusAuthCode.value = "";

  // If neither code nor state is present in the route query, redirect to
  // Globus Auth
  if (!route.query.code && !route.query.state) {
    redirectToGlobusAuth();
    return;
  }
  // if only one of code or state is present, redirect to error page
  if (lxor(route.query.code, route.query.state)) {
    console.log("Code or State not present");
    // Todo - redirect to error page if code or state is missing
  } else {
    // if both code and state are present, verify if state sent in the Globus
    // auth request matches the state returned by Globus auth
    if (route.query.state === globusAuthStoredState.value) {
      console.log("State matches");
      console.log("state:", globusAuthStoredState.value);
      globusAuthCode.value = route.query.code;
      // console.log("Post-auth code", globusAuthCode.value);
      GlobusAuthService.getToken({
        code: globusAuthCode.value,
      })
        .then((response) => {
          console.log(
            "globus/index.vue: Globus Auth token received:",
            response.data.access_token,
          );
          auth.setGlobusAccessToken(response.data.access_token);
          const stateRedirectURL = atob(
            globusAuthStoredState.value.split(":")[1],
          );
          console.log("Redirecting to", stateRedirectURL);
          router.push(stateRedirectURL);
        })
        .catch((err) => {
          console.error(err);
          router.push("/");
        });

      // router.push("/globus/transfer");
    } else {
      console.log("State does not match");
      // Todo - redirect to error page if state does not match
    }
  }
});
</script>

<style scoped></style>

<route lang="yaml">
meta:
  requiresRoles: ["operator", "admin"]
</route>
