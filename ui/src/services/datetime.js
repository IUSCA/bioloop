import dayjs from "dayjs";
// import utc from "dayjs/plugin/utc";
// import tz from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import duration from "dayjs/plugin/duration";

// dayjs.extend(utc);
// dayjs.extend(tz);
dayjs.extend(relativeTime);
dayjs.extend(duration);

// const timeZone = dayjs.tz.guess();

function date(value) {
  // value = "2023-06-14T01:18:40.501Z";
  return dayjs(value).format("MMM D YYYY");

  // const timeZone = dayjs.tz.guess()
  // dayjs.utc(dateToConvert).tz(timeZone)
}

function approx_relative_time(value, ...args) {
  return dayjs(value).fromNow(...args);
}

function absolute(date) {
  return dayjs(date).format("YYYY-MM-DD HH:mm:ss UTCZ");
}

function parse_time_remaining(t) {
  if (t == null) {
    return null;
  } else {
    if (t == 1e100) {
      // infinity
      return null;
    } else {
      return dayjs.duration(t * 1000).humanize();
    }
  }
}

export { date, approx_relative_time, absolute, parse_time_remaining };
