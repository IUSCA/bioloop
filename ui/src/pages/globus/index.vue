<script setup>
import config from "@/config";
import { lxor } from "@/services/utils";
import { v4 as uuidv4 } from "uuid";

const router = useRouter();
const route = useRoute();
const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));
const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));
// const queryParams = route.params;

const constructGlobusAuthURL = () => {
  const globusAuthBaseURL = config.globus.auth_url;
  const clientId = config.globus.client_id;
  const redirectUri = config.globus.redirect_uri;
  const scopes = config.globus.scopes.split(",").join(" ");
  const response_type = "code";
  globusAuthStoredState.value = uuidv4();
  console.log("Pre-auth Stored State", globusAuthStoredState.value);
  return (
    `${globusAuthBaseURL}?` +
    `client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=${response_type}` +
    `&scope=${scopes}` +
    `&state=${globusAuthStoredState.value}`
  );
};

const redirectToGlobusAuth = () => {
  // router.push(constructGlobusAuthURL());
  window.location.replace(constructGlobusAuthURL());
};

onMounted(() => {
  // reset code if already exists in local storage
  globusAuthCode.value = ""

  // If neither code nor state is present in the route query, redirect to Globus Auth
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
      globusAuthCode.value = route.query.code;
      // console.log("Post-auth code", globusAuthCode.value);
      router.push("/globus/transfer");
    } else {
      console.log("State does not match");
      // Todo - redirect to error page if state does not match
    }
  }
});

onBeforeUnmount(() => {
  // todo - clear access token from local storage
});
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Globus
  requiresRoles: ["operator", "admin"]
</route>
