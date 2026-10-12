import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  absolute,
  date,
  daysFromNow,
  displayDateTime,
  formatDuration,
  fromNow,
  getMidnightNextDay,
  readableDuration,
  time,
} from "@/services/datetime";

const ISO = "2023-06-14T01:18:40.501Z";

describe("null handling", () => {
  it.each([
    ["date", date],
    ["time", time],
    ["displayDateTime", displayDateTime],
    ["absolute", absolute],
    ["fromNow", fromNow],
    ["daysFromNow", daysFromNow],
    ["readableDuration", readableDuration],
    ["formatDuration", formatDuration],
  ])("%s returns null for nullish input", (_name, fn) => {
    expect(fn(null)).toBeNull();
    expect(fn(undefined)).toBeNull();
  });
});

describe("date / time display", () => {
  it("formats a local calendar date", () => {
    expect(date(ISO)).toMatch(/Jun 1[34] 2023/);
  });

  it("formats a local 12-hour time with seconds", () => {
    expect(time(ISO)).toMatch(/^\d{2}:\d{2}:\d{2} (AM|PM)$/);
  });

  it("formats a local date and time without seconds", () => {
    expect(displayDateTime(ISO)).toMatch(
      /^Jun 1[34] 2023, \d{2}:\d{2} (AM|PM)$/,
    );
  });

  it("formats an absolute timestamp with timezone offset by default", () => {
    expect(absolute(ISO)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/,
    );
  });

  it("omits the timezone offset when requested", () => {
    expect(absolute(ISO, false)).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
});

describe("relative time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-06-16T01:18:40.501Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("describes how long ago a timestamp was", () => {
    expect(fromNow(ISO)).toBe("2 days ago");
  });

  it("can omit the suffix", () => {
    expect(fromNow(ISO, true)).toBe("2 days");
  });

  it("returns the day difference from now", () => {
    expect(daysFromNow(ISO)).toBe(-2);
  });
});

describe("readableDuration", () => {
  it("humanizes milliseconds", () => {
    expect(readableDuration(130 * 1000)).toBe("2 minutes");
  });

  it("can include a suffix", () => {
    expect(readableDuration(130 * 1000, true)).toBe("in 2 minutes");
    expect(readableDuration(-130 * 1000, true)).toBe("2 minutes ago");
  });

  it("returns null for invalid or infinite values", () => {
    expect(readableDuration("130")).toBeNull();
    expect(readableDuration(NaN)).toBeNull();
    expect(readableDuration(1e100)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [12 * 1000, "12s"],
    [120 * 1000, "2m 0s"],
    [1200 * 1000, "20m"],
    [12000 * 1000, "3h 20m"],
    [120000 * 1000, "1d 9h"],
  ])("formats %s ms as %s", (duration, expected) => {
    expect(formatDuration(duration)).toBe(expected);
  });

  it("returns null for invalid or infinite values", () => {
    expect(formatDuration("12")).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(1e100)).toBeNull();
  });
});

describe("getMidnightNextDay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns local midnight of the next day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2023, 9, 1, 15, 30, 0));

    expect(getMidnightNextDay()).toEqual(new Date(2023, 9, 2, 0, 0, 0));
  });
});
