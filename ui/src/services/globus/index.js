import config from "@/config";
import { v4 as uuidv4 } from "uuid";

const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));
// const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));

const getGlobusAuthURL = (delimitedStateAttributes) => {
  const globusAuthBaseURL = config.globus.auth_url;
  const clientId = config.globus.client_id;
  const redirectUri = config.globus.redirect_uri;
  const scopes = encodeURIComponent(config.globus.scopes);
  const response_type = "code";
  globusAuthStoredState.value = uuidv4() + ":" + btoa(delimitedStateAttributes); // base64 encoded state attributes
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
 * @param persistentStateAttributes Array of attributes to persist in the state
 * that will be used to request an authorization code. Attributes encoded in
 * the state can later be decoded and used after an authorization code has been
 * granted.
 */
const redirectToGlobusAuth = ({ persistentStateAttributes = [] } = {}) => {
  // const _persistInState = ["A", "B"];
  const delimitedStateAttributes = persistentStateAttributes.reduce(
    (total, currentVal, index) => {
      return (
        total +
        currentVal +
        (index < persistentStateAttributes.length - 1 ? ":" : "")
      );
    },
    "",
  );
  console.log("Persistent Attributes", delimitedStateAttributes);
  // getGlobusAuthURL(delimitedStateAttributes);
  window.location.replace(getGlobusAuthURL(delimitedStateAttributes));
};

const getGlobusTransferRequestBody = ({
  submissionId,
  sourceFile,
  destinationFile,
  destinationCollectionId,
}) => {
  console.log("source_file", sourceFile);
  return {
    DATA: [
      {
        DATA_TYPE: "transfer_item",
        // destination_path: config.globus.destination_endpoint_path,
        // source_path: 'multiprocessing_jumpstart',
        // destination_path: "/home/u_otp4tsmynba3hhwlxymrnhxlmq/",
        destination_path: destinationFile,
        source_path: sourceFile,
      },
    ],
    DATA_TYPE: "transfer",
    destination_endpoint: destinationCollectionId,
    source_endpoint: config.globus.source_collection_id,
    submission_id: submissionId,
  };
};

export { getGlobusTransferRequestBody, redirectToGlobusAuth };
