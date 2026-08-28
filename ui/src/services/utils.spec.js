import { describe, expect, it } from "vitest";

import {
  arrayEquals,
  capitalize,
  caseInsensitiveIncludes,
  cmp,
  difference,
  filterByValues,
  formatBytes,
  groupBy,
  groupByAndAggregate,
  initials,
  lxor,
  mapValues,
  maybePluralize,
  setIntersection,
  snakeCaseToTitleCase,
  union,
  validateEmail,
} from "@/services/utils";

describe("formatBytes", () => {
  it.each([
    [0, "0 Bytes"],
    [1, "1 Bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1048576, "1 MB"],
  ])("formats %s as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("returns an empty string for missing values", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes("")).toBe("");
  });

  it("parses numeric strings", () => {
    expect(formatBytes("1024")).toBe("1 KB");
  });

  it("honors a decimal places argument", () => {
    expect(formatBytes(1536, 0)).toBe("2 KB");
  });
});

describe("snakeCaseToTitleCase", () => {
  it("converts snake_case to title case", () => {
    expect(snakeCaseToTitleCase("raw_data")).toBe("Raw Data");
  });
});

describe("capitalize", () => {
  it("capitalizes the first character", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("returns an empty string for falsy values", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize(null)).toBe("");
  });
});

describe("maybePluralize", () => {
  it("keeps the noun singular for a count of 1", () => {
    expect(maybePluralize(1, "file")).toBe("1 file");
  });

  it("pluralizes for other counts", () => {
    expect(maybePluralize(0, "file")).toBe("0 files");
    expect(maybePluralize(2, "file")).toBe("2 files");
  });

  it("can omit the count", () => {
    expect(maybePluralize(2, "file", "s", false)).toBe("files");
  });
});

describe("validateEmail", () => {
  it("accepts a simple email", () => {
    expect(validateEmail("e@iu.edu")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validateEmail("e@iu")).toBe(false);
  });
});

describe("lxor", () => {
  it("is true when exactly one argument is truthy", () => {
    expect(lxor(true, false)).toBe(true);
    expect(lxor(false, true)).toBe(true);
  });

  it("is false when both arguments match", () => {
    expect(lxor(true, true)).toBe(false);
    expect(lxor(false, false)).toBe(false);
  });
});

describe("cmp", () => {
  it("compares values", () => {
    expect(cmp(1, 2)).toBe(-1);
    expect(cmp(2, 1)).toBe(1);
    expect(cmp(1, 1)).toBe(0);
  });

  it("sorts null after non-null values", () => {
    expect(cmp(null, 1)).toBe(1);
    expect(cmp(1, null)).toBe(-1);
    expect(cmp(null, null)).toBe(0);
  });
});

describe("caseInsensitiveIncludes", () => {
  it("matches regardless of case", () => {
    expect(caseInsensitiveIncludes("Hello, World!", "hello")).toBe(true);
    expect(caseInsensitiveIncludes("Hello, World!", "WORLD")).toBe(true);
    expect(caseInsensitiveIncludes("Hello, World!", "Hi")).toBe(false);
  });

  it("treats nullish values as equal only to each other", () => {
    expect(caseInsensitiveIncludes("Hello", null)).toBe(false);
    expect(caseInsensitiveIncludes(null, null)).toBe(true);
  });
});

describe("initials", () => {
  it("uses the first and last names", () => {
    expect(initials("Elijah Kim")).toBe("EK");
  });

  it("uses a single character for one word", () => {
    expect(initials("Elijah")).toBe("E");
  });
});

describe("arrayEquals", () => {
  it("compares arrays by value and order", () => {
    expect(arrayEquals([1, 2], [1, 2])).toBe(true);
    expect(arrayEquals([1, 2], [2, 1])).toBe(false);
    expect(arrayEquals([1], [1, 2])).toBe(false);
  });
});

describe("mapValues / filterByValues", () => {
  it("maps each entry with key and value", () => {
    expect(mapValues({ a: 1, b: 2 }, (key, value) => `${key}:${value}`)).toEqual(
      {
        a: "a:1",
        b: "b:2",
      },
    );
  });

  it("keeps entries that match the predicate", () => {
    expect(
      filterByValues({ name: "x", location: "/", minSize: 0 }, (key) =>
        ["name", "minSize"].includes(key),
      ),
    ).toEqual({
      name: "x",
      minSize: 0,
    });
  });
});

describe("set helpers", () => {
  it("computes difference, union, and intersection", () => {
    expect([...difference(new Set([1, 2, 3]), new Set([2]))]).toEqual([1, 3]);
    expect([...union(new Set([1, 2]), new Set([2, 3]))].sort()).toEqual([
      1, 2, 3,
    ]);
    expect([...setIntersection(new Set([1, 2, 3]), new Set([2, 3, 4]))]).toEqual(
      [2, 3],
    );
  });
});

describe("groupBy", () => {
  it("groups items by a key", () => {
    expect(
      groupBy("type")([
        { type: "a", id: 1 },
        { type: "b", id: 2 },
        { type: "a", id: 3 },
      ]),
    ).toEqual({
      a: [
        { type: "a", id: 1 },
        { type: "a", id: 3 },
      ],
      b: [{ type: "b", id: 2 }],
    });
  });
});

describe("groupByAndAggregate", () => {
  it("groups values and aggregates each group", () => {
    expect(
      groupByAndAggregate(
        [1, 1, 2, 2, 2],
        "groupedBy",
        "aggregatedValue",
        (groupedValues) =>
          groupedValues.reduce(
            (accumulator, currentVal) => accumulator + currentVal,
          ),
      ),
    ).toEqual([
      { groupedBy: "1", aggregatedValue: 2 },
      { groupedBy: "2", aggregatedValue: 6 },
    ]);
  });
});
