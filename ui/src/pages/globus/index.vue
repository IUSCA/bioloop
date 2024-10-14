<!--<template>-->
<!--  &lt;!&ndash;  <va-button @click="redirectToGlobusAuth">Initiate Globus Transfer</va-button>&ndash;&gt;-->
<!--</template>-->

<script setup>
import config from "@/config";
import { v4 as uuidv4 } from "uuid";
import { lxor } from "@/services/utils";

const router = useRouter();
const route = useRoute();
const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));
const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));
// const queryParams = route.params;

// https://auth.globus.org/v2/oauth2/authorize?client_id=45654245-2fab-4c01-8b3f-ed7d678b6697&scope=urn:globus:auth:scope:transfer.api.globus.org:all+openid+profile+email&response_type=code&redirect_uri=https://localhost&state=g6l14b2xlgx4dtce8d2ja714i

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
  // If neither code nor state is present in the route query, redirect to Globus Auth
  if (!route.query.code && !route.query.state) {
    redirectToGlobusAuth();
    return;
  }
  // if only one of code or state is present, redirect to error page
  if (lxor(route.query.code, route.query.state)) {
    // Todo - redirect to error page if code or state is missing
  } else {
    // if both code and state are present, verify if state sent in the Globus
    // auth request matches the state returned by Globus auth
    if (route.query.state === globusAuthStoredState.value) {
      globusAuthCode.value = route.query.code;
      router.push("/globus/transfer");
    } else {
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
