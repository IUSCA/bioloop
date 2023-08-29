import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";

dayjs.extend(relativeTime);
dayjs.extend(duration);

function date(value) {
  /**
   * This function is intended to convert an ISO 8601 datetime string
   * (with Z - UTC timezone) ex: "2023-06-14T01:18:40.501Z"
   * to a date string of format MMM D YYYY in browser's local time zone ex: "Jun 13 2023"
   *
   * date("2023-06-14T01:18:40.501Z") -> "Jun 14 2023"
   */
  if (value == null) return null;
  return dayjs(value).format("MMM D YYYY");
}

function absolute(value, timezoneOffset = true) {
  /**
   * This function is intended to convert an ISO 8601 datetime string
   * (with Z - UTC timezone) ex: "2023-06-14T01:18:40.501Z"
   * to a date string of format YYYY-MM-DD HH:mm:ss in browser's local time zone
   * ex: "2023-06-13 21:18:40 -04:00"
   */
  if (value == null) return null;
  const formatString = "YYYY-MM-DD HH:mm:ss" + (timezoneOffset ? " Z" : "");
  return dayjs(value).format(formatString);
}

function fromNow(value, withoutSuffix) {
  /**
   * fromNow("2023-06-14T01:18:40.501Z") -> "2 months ago"
   * fromNow("2023-06-14T01:18:40.501Z", true) -> "2 months"
   */
  if (value == null) return null;
  return dayjs(value).fromNow(withoutSuffix);
}

function readableDuration(t, withSuffix) {
  /**
   * represent a duration (in milliseconds) in human readable format
   *
   * readableDuration(130 * 1000) -> '2 minutes'
   * readableDuration(130 * 1000, true) -> 'in 2 minutes'
   * readableDuration(-130 * 1000) -> '2 minutes'
   * readableDuration(-130 * 1000, true) -> '2 minutes ago'
   *
   * Infinity is represented in JSON with 1e1000
   * but we ran into some problems with conversion of 1e1000 into number,
   * so anything above 1e100 is treated as infinity.
   *
   * readableDuration(1e100) -> null
   *
   */
  if (t == null || typeof t !== "number" || isNaN(t)) return null;
  if (t >= 1e100) return null; // infinity
  return dayjs.duration(t).humanize(withSuffix);
}

function formatDuration(duration) {
  /**
   * represent a duration in milliseconds in human readable format with more precision
   * duration: milliseconds - number
   *
   * formatDuration(12 * 1000)       -> "12s"
   * formatDuration(120 * 1000)      -> "2m 0s"
   * formatDuration(1200 * 1000)     -> "20m"
   * formatDuration(12000 * 1000)    -> "3h 20m"
   * formatDuration(120000 * 1000)   -> "1d 9h"
   * formatDuration(1200000 * 1000)  -> "13d 21h"
   * formatDuration(12000000 * 1000) -> "138d 21h"
   */
  if (duration == null || typeof duration !== "number" || isNaN(duration))
    return null;
  if (duration >= 1e100) return null; // infinity
  let ans = "";
  const d = dayjs.duration(duration);

  if (d.asSeconds() < 60) {
    ans = d.seconds() + "s";
  } else if (d.asMinutes() < 10) {
    ans = d.minutes() + "m " + d.seconds() + "s";
  } else if (d.asMinutes() < 60) {
    ans = d.minutes() + "m";
  } else if (d.asHours() < 24) {
    ans = d.hours() + "h " + d.minutes() + "m";
  } else {
    ans = Math.floor(d.asDays()) + "d " + d.hours() + "h";
  }
  return ans;
}

export { date, absolute, fromNow, readableDuration, formatDuration };
