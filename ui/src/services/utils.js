import dayjs from "dayjs";
import { jwtDecode } from "jwt-decode";
import _ from "lodash";

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
 * Given an array, groups the elements of the array based on the grouping function provided,
 * aggregates values from the grouped elements by calling the aggregation function provided
 * on the collection of grouped elements, and returns an array, every element of which contains
 * the aggregated values produced from each grouping as well as the value used for producing
 * said groupings. The order of grouped values is determined by the order they occur in the array
 * provided.
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
 *                                                     (in the returned array) by which elements
 *                                                     in arr will be grouped
 * @param {string} aggregatedResultKey                 The key used for representing the aggregation
 *                                                     results (in the returned array) per grouping
 * @param {Function} aggregationFn                     Callback used for aggregating the results in
 *                                                     each grouping
 * @param {Function} [groupByFn = (e) => e]            Optional callback used to group the elements
 *                                                     of arr
 * @param {Function} [groupedByValFormatFn = (e) => e] Optional callback used to format the values
 *                                                     (in the returned array) by which groupings
 *                                                     are produced
 * @returns                                            An array, every element of which contains the
 *                                                     aggregated values produced from each grouping
 *                                                     as well as the values used for producing said
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
  isLiveToken,
  lxor,
  mapValues,
  maybePluralize,
  setIntersection,
  union,
  validateEmail,
};
