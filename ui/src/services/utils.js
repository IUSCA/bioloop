import config from "@/config";
import axios from "axios";
import dayjs from "dayjs";
import DOMPurify from "dompurify";
import { jwtDecode } from "jwt-decode";
import _ from "lodash";

const snakeCaseToTitleCase = (value) => {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

function formatBytes(bytes, decimals = 2) {
  bytes = parseInt(bytes);
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
function maybePluralize(count, noun, suffix = "s", showCount = true) {
  return (showCount ? `${count} ` : "") + `${noun}${count !== 1 ? suffix : ""}`;
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
  // treats null as less than everything else
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
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
  const parts = (name || "").trim().split(" ");
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

function groupBy(key) {
  return (data) => {
    return data.reduce((acc, curr) => {
      const groupKeyValue = curr[key];
      acc[groupKeyValue] = (acc[groupKeyValue] || []).concat(curr);
      return acc;
    }, {});
  };
}

/**
 * Given an array, groups the elements of the array based on the grouping
 * function provided, aggregates values from the grouped elements by calling
 * the aggregation function provided on the collection of grouped elements,
 * and returns an array, every element of which contains the aggregated values
 * produced from each grouping as well as the value used for producing said
 * groupings. The order of grouped values is determined by the order they occur
 * in the array provided.
 *
 * Example usage:
 * groupByAndAggregate(
 *   [1, 1, 2, 2, 2],
 *   "groupedBy",
 *   "aggregatedValue",
 *   (groupedValues) => (
 *     groupedValues
 *       .reduce((accumulator, currentVal) => accumulator + currentVal)
 *   ),
 * );
 * // => [{ "groupedBy": "1", "aggregatedValue": 2 }, { "groupedBy": "2", "aggregatedValue": 6 }]
 *
 * @param {[*]} arr                                    The array whose elements are to be grouped
 *                                                     and aggregated
 * @param {string} groupedByKey                        The key used for representing the values
 *                                                     (in the returned array)
 *                                                     by which elements in arr
 *                                                     will be grouped
 * @param {string} aggregatedResultKey                 The key used for representing the aggregation
 *                                                     results (in the returned
 *                                                     array) per grouping
 * @param {Function} aggregationFn                     Callback used for aggregating the results in
 *                                                     each grouping
 * @param {Function} [groupByFn = (e) => e]            Optional callback used to group the elements
 *                                                     of arr
 * @param {Function} [groupedByValFormatFn = (e) => e] Optional callback used to format the values
 *                                                     (in the returned array)
 *                                                     by which groupings are
 *                                                     produced
 * @returns                                            An array, every element of which contains the
 *                                                     aggregated values
 *                                                     produced from each
 *                                                     grouping as well as the
 *                                                     values used for
 *                                                     producing said
 *                                                     groupings.
 */
function groupByAndAggregate(
  arr,
  groupedByKey,
  aggregatedResultKey,
  aggregationFn,
  groupByFn = (e) => e,
  groupedByValFormatFn = (e) => e,
) {
  const grouped = _.groupBy(arr, groupByFn);
  const ret = [];
  Object.entries(grouped).forEach(([groupedKey, groupedValues]) => {
    ret.push({
      [groupedByKey]: groupedByValFormatFn(groupedKey),
      [aggregatedResultKey]: aggregationFn(groupedValues),
    });
  });
  return ret;
}

/**
 * Returns whether the given feature is enabled for any of the given roles or
 * not.
 *
 * @param featureKey the key of the feature. Defined in `config.js`, under `enabled_features`
 * @param hasRole function that returns true if the user has the given role.
 // * @param roles the roles of the user whose access to this feature is to be determined.
 */
function isFeatureEnabled({ featureKey, hasRole = () => false } = {}) {
  if (!featureKey) {
    return true;
  }

  // Check if `enabledFeatures` is defined
  if (!config.enabledFeatures) {
    // console.log("enabledFeatures is not defined in the config. Feature will
    // be enabled by default");
    return true;
  }

  const featureEnabled = config.enabledFeatures[featureKey];

  // Check if feature is defined
  if (featureEnabled == null) {
    // console.log(
    // `${featureKey} feature is not defined in the config. Feature will be
    // enabled by default`, );
    return true;
  }

  // Check if feature is a boolean
  if (typeof featureEnabled === "boolean") {
    return featureEnabled;
  }

  // Check if feature is an object
  if (typeof featureEnabled !== "object") {
    // console.error(`Invalid config for ${featureKey} feature`);
    return false;
  }

  // Check if `enabledForRoles` is an array
  if (!Array.isArray(featureEnabled.enabledForRoles)) {
    // console.error(
    // `Invalid config for ${featureKey} feature: enabledForRoles is not an
    // array`, );
    return false;
  }

  // Check if enabledForRoles is empty
  if (featureEnabled.enabledForRoles.length === 0) {
    // console.warn(`No roles specified for enabling ${featureKey} feature`);
    return false;
  }

  // Check if user has one of the allowed roles
  return featureEnabled.enabledForRoles.some((role) => hasRole(role));
}

function isHTTPError(code) {
  return (error) => axios.isAxiosError(error) && error.response.status === code;
}

const is404 = isHTTPError(404);
const is403 = isHTTPError(403);

function navigateBackSafely(router, fallback = "/") {
  const from = router.currentRoute.value.fullPath;

  window.history.back();

  setTimeout(() => {
    const to = router.currentRoute.value.fullPath;
    if (to === from) {
      router.replace(fallback);
    }
  }, 300);
}

/**
 * Sanitizes user-provided HTML content to prevent XSS attacks while preserving
 * the most-commonly needed HTML elements.
 *
 * @param {string} content - The user-provided content to sanitize
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoLink - Whether to automatically convert URLs to links (default: true)
 * @param {boolean} options.autoEmail - Whether to automatically convert emails to mailto links (default: true)
 * @param {string[]} options.classes - CSS classes to use on sanitized element
 * @param {string[]} options.allowedTags - Additional HTML tags to allow beyond the defaults
 * @param {string[]} options.allowedAttributes - Additional HTML attributes to allow beyond the defaults
 * @returns {string} Sanitized HTML content safe for rendering
 */
function sanitize(content, options = {}) {
  if (!content || typeof content !== "string") {
    return "";
  }

  const {
    autoLink = true,
    autoEmail = true,
    allowedTags = [],
    allowedAttributes = [],
    classes = [],
  } = options;

  let processed = content;

  // Convert URLs into clickable links if enabled
  if (autoLink) {
    processed = processed.replace(
      /(https?:\/\/[^\s<>"']+)/g,
      `<a href="$1" target="_blank" rel="noopener noreferrer" class="${classes.join(" ")}">$1</a>`,
    );
  }

  // Convert email addresses into mailto links if enabled
  if (autoEmail) {
    processed = processed.replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      `<a href="mailto:$1" class="${classes.join(" ")}">$1</a>`,
    );
  }

  // Default allowed tags for common safe HTML elements
  const defaultAllowedTags = [
    "a", // Links
    "p", // Paragraphs
    "br", // Line breaks
    "strong",
    "b", // Bold text
    "em",
    "i", // Italic text
    "u", // Underlined text
    "code", // Inline code
    "pre", // Preformatted text
    "ul",
    "ol",
    "li", // Lists
    "blockquote", // Quotes
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6", // Headings
  ];

  // Default allowed attributes for safe HTML
  const defaultAllowedAttributes = [
    "href", // For links
    "target", // For link targets
    "rel", // For link relationships
    "class", // For styling
    "title", // For tooltips
    "alt", // For accessibility
    "id", // For anchoring (with restrictions)
  ];

  // Combine default and custom allowed tags/attributes
  const finalAllowedTags = [
    ...new Set([...defaultAllowedTags, ...allowedTags]),
  ];
  const finalAllowedAttributes = [
    ...new Set([...defaultAllowedAttributes, ...allowedAttributes]),
  ];

  // Sanitize to prevent XSS while preserving allowed elements
  return DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: finalAllowedTags,
    ALLOWED_ATTR: finalAllowedAttributes,
    // Additional security configurations
    ALLOW_DATA_ATTR: false, // Disable data-* attributes
    ALLOW_UNKNOWN_PROTOCOLS: false, // Only allow known protocols
    SANITIZE_DOM: true, // Clean up DOM clobbering
    KEEP_CONTENT: true, // Keep text content even if tags are removed
    // Ensure links are safe
    ADD_ATTR: ["target", "rel"], // Always add these to links
    FORBID_ATTR: ["style", "on*"], // Forbid inline styles and event handlers
  });
}

export {
  arrayEquals,
  capitalize,
  caseInsensitiveIncludes,
  cmp,
  dayjs,
  difference,
  downloadFile,
  filterByValues,
  formatBytes,
  groupBy,
  groupByAndAggregate,
  initials,
  is403,
  is404,
  isFeatureEnabled,
  isHTTPError,
  isLiveToken,
  lxor,
  mapValues,
  maybePluralize,
  navigateBackSafely,
  sanitize,
  setIntersection,
  snakeCaseToTitleCase,
  union,
  validateEmail
};

