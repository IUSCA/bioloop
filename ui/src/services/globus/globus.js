import config from "@/config";
import { v4 as uuidv4 } from "uuid";

const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));
// const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));

const getGlobusAuthURL = (persistentStateAttributes) => {
  const globusAuthBaseURL = config.globus.auth_url;
  const clientId = config.globus.client_id;
  const redirectUri = config.globus.redirect_uri;
  const scopes = config.globus.scopes.split(",").join(" ");
  const response_type = "code";
  globusAuthStoredState.value =
    uuidv4() + ":" + btoa(persistentStateAttributes);
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

const redirectToGlobusAuth = ({ persistInState = [] } = {}) => {
  // const _persistInState = ["A", "B"];
  const persistentStateAttributes = persistInState.reduce(
    (total, currentVal, index) => {
      return (
        total + currentVal + (index < persistInState.length - 1 ? ":" : "")
      );
    },
    "",
  );
  console.log("Persistent Attributes", persistentStateAttributes);
  window.location.replace(getGlobusAuthURL(persistentStateAttributes));
};

export { redirectToGlobusAuth };
