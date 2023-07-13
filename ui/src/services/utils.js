import dayjs from "dayjs";
import jwtDecode from "jwt-decode";
import moment from "moment-timezone";

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

function format_duration(duration) {
  let formattedDuration = "";

  if (duration.asSeconds() < 60) {
    formattedDuration = duration.seconds() + "s";
  } else if (duration.asMinutes() < 10) {
    formattedDuration = duration.minutes() + "m " + duration.seconds() + "s";
  } else if (duration.asMinutes() < 60) {
    formattedDuration = duration.minutes() + "m ";
  } else if (duration.asHours() < 24) {
    formattedDuration = duration.hours() + "h " + duration.minutes() + "m ";
  } else {
    formattedDuration =
      Math.floor(duration.asDays()) + "d " + duration.hours() + "h";
  }
  return formattedDuration;
}

function utc_date_to_local_tz(date) {
  return moment.utc(date).tz(moment.tz.guess()).format("YYYY-MM-DD HH:mm:ss z");
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

export {
  formatBytes,
  difference,
  union,
  maybePluralize,
  dayjs,
  validateEmail,
  capitalize,
  isLiveToken,
  format_duration,
  utc_date_to_local_tz,
  lxor,
  cmp,
  setIntersection,
  caseInsensitiveIncludes,
};
