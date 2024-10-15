import config from "@/config";
import { v4 as uuidv4 } from "uuid";

const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));
// const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));

const getGlobusAuthURL = (persistentStateAttributes) => {
  const globusAuthBaseURL = config.globus.auth_url;
  const clientId = config.globus.client_id;
  const redirectUri = config.globus.redirect_uri;
  const scopes = encodeURIComponent(config.globus.scopes);
  const response_type = "code";
  globusAuthStoredState.value =
    uuidv4() + ":" + btoa(persistentStateAttributes); // base64 encoded state attributes
  // console.log("Pre-auth Stored State", globusAuthStoredState.value);
  const url =
    `${globusAuthBaseURL}?` +
    `client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=${response_type}` +
    `&scope=${scopes}` +
    `&state=${globusAuthStoredState.value}`;

  // console.log("Globus Auth URL", ret);
  return url;
};

/**
 *
 * @param persistentStateAttributes Array of attributes (strings) to persist in the state
 * that will be used to request an authorization code.
 */
const redirectToGlobusAuth = ({ persistentStateAttributes = [] } = {}) => {
  // const _persistInState = ["A", "B"];
  const stateAttributesToPersist = persistentStateAttributes.reduce(
    (total, currentVal, index) => {
      return (
        total +
        currentVal +
        (index < persistentStateAttributes.length - 1 ? ":" : "")
      );
    },
    "",
  );
  console.log("Persistent Attributes", stateAttributesToPersist);
  // getGlobusAuthURL(stateAttributesToPersist);
  window.location.replace(getGlobusAuthURL(stateAttributesToPersist));
};

const getGlobusTransferRequestBody = ({
  submissionId,
  file,
  destinationEndpointId,
}) => {
  return {
    DATA: [
      {
        DATA_TYPE: "transfer_item",
        destination_path: file,
        source_path: `${config.globus.source_endpoint_path}/${file}`,
      },
    ],
    DATA_TYPE: "transfer",
    destination_endpoint: destinationEndpointId,
    source_endpoint: config.globus.source_endpoint_id,
    submission_id: submissionId,
  };
};

export { redirectToGlobusAuth, getGlobusTransferRequestBody };
