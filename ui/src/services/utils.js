import dayjs from "dayjs";
import jwtDecode from "jwt-decode";

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  if (!bytes) return "";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function difference(setA, setB) {
  const _difference = new Set(setA);
  for (const elem of setB) _difference.delete(elem);

  return _difference;
}

function union(setA, setB) {
  const _union = new Set(setA);
  for (const elem of setB) _union.add(elem);

  return _union;
}

function setIntersection(setA, setB) {
  const _setA = new Set(setA);
  const _setB = new Set(setB);
  const _intersection = new Set();
  // eslint-disable-next-line no-restricted-syntax
  for (const elem of _setA) {
    if (_setB.has(elem)) _intersection.add(elem);
  }

  return _intersection;
}

// https://stackoverflow.com/questions/27194359/javascript-pluralize-an-english-string
function maybePluralize(count, noun, suffix = "s") {
  return `${count} ${noun}${count !== 1 ? suffix : ""}`;
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

const capitalize = (s) => (s && s[0].toUpperCase() + s.slice(1)) || "";

function isLiveToken(jwt) {
  if (jwt) {
    try {
      // console.log("isLiveToken", jwt);
      // const payload_enc = jwt.split(".")[1];
      // const payload_str = window.atob(payload_enc);
      // const payload = JSON.parse(payload_str);
      const payload = jwtDecode(jwt);
      const expiresAt = new Date(payload.exp * 1000);
      console.log("current token expires at", expiresAt);
      if (new Date() < expiresAt) {
        // valid
        return true;
      }
    } catch (err) {
      console.error("Errored trying to decode access token", err);
    }
  }
  return false;
}

function lxor(a, b) {
  // logical XOR
  return (a || b) && !(a && b);
}

function cmp(a, b) {
  return a != null && b != null ? (a < b ? -1 : a > b ? 1 : 0) : 0;
}

function caseInsensitiveIncludes(str, searchValue) {
  /**
   * const text = "Hello, World!";
   * f(text, "hello")); // true
   * f(text, "WORLD")); // true
   * f(text, "Hi"));    // false
   * f(text, null));    // false
   * f(null, null));    // true
   */

  // Handle undefined and / or null values separately
  if (str == null || searchValue == null) {
    return str === searchValue;
  }

  // Convert both strings to lowercase for case-insensitive comparison
  const lowerStr = str.toLowerCase();
  const lowerSearchValue = searchValue.toLowerCase();

  return lowerStr.includes(lowerSearchValue);
}

function getFileNameFromUrl(fileUrl) {
  // Extract the filename from the URL by splitting on '/'
  const url = new URL(fileUrl);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

function downloadFile({ url, filename = null }) {
  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = url;
  anchor.target = "_blank";

  // Set the file name (you can extract it from the URL or hardcode it)
  anchor.download = filename || getFileNameFromUrl(url);

  // Append the anchor to the DOM
  document.body.appendChild(anchor);

  // Trigger a click on the anchor to initiate the download
  anchor.click();

  // Clean up: remove the anchor from the DOM
  document.body.removeChild(anchor);
}

function initials(name) {
  const parts = (name || "").split(" ");
  if (parts.length == 1) return parts[0][0];
  else {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  }
}

function arrayEquals(array1, array2) {
  return (
    array1.length === array2.length &&
    array1.every((value, index) => value === array2[index])
  );
}

function mapValues(obj, fn) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    acc[key] = fn(key, value);
    return acc;
  }, {});
}

function filterByValues(obj, pred) {
  return Object.entries(obj)
    .filter(([k, v]) => {
      return pred(k, v);
    })
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
}

function getDatasetPathPrefix(dataset) {
  if (!dataset) {
    return;
  }
  const datasetPathPrefix =
    dataset.type.replace("_", "").toLowerCase() +
    (dataset.type === "DATA_PRODUCT" ? "s" : "");
  return `/${datasetPathPrefix}`;
}

export {
  formatBytes,
  difference,
  union,
  maybePluralize,
  dayjs,
  validateEmail,
  capitalize,
  isLiveToken,
  lxor,
  cmp,
  setIntersection,
  caseInsensitiveIncludes,
  downloadFile,
  initials,
  arrayEquals,
  mapValues,
  filterByValues,
  getDatasetPathPrefix,
};
