import { describe, expect, it } from "vitest";

import {
  compareFileNames,
  createFileTableRows,
  decodeFileSize,
  encodeFileSize,
  getBreadcrumbItems,
  getFileExtension,
  getParentPath,
  getShortPath,
} from "./fileBrowserUtils";

describe("getShortPath", () => {
  // Verifies a shallow file path displays its complete parent directory.
  it("keeps a shallow file path", () => {
    expect(getShortPath("data/file.fastq", false)).toBe("data/");
  });

  // Verifies a deep file path displays only its two nearest directories.
  it("shortens a deep file path", () => {
    expect(getShortPath("data/project/run/file.fastq", false)).toBe(
      ".../project/run/",
    );
  });

  // Verifies a shallow directory path remains unchanged.
  it("keeps a shallow directory path", () => {
    expect(getShortPath("data/project", true)).toBe("data/project");
  });

  // Verifies a deep directory path displays only its final two directories.
  it("shortens a deep directory path", () => {
    expect(getShortPath("data/project/run", true)).toBe(".../project/run");
  });

  // Verifies root and missing paths have safe display values.
  it.each([
    ["/", true, "/"],
    ["", false, ""],
    [undefined, false, ""],
  ])("handles the path %s", (path, isDirectory, expected) => {
    expect(getShortPath(path, isDirectory)).toBe(expected);
  });
});

describe("getParentPath", () => {
  // Verifies clicking a file can navigate to its containing directory.
  it("returns the parent of a nested file", () => {
    expect(getParentPath("data/project/file.fastq")).toBe("data/project");
  });

  // Verifies absolute paths preserve their leading slash.
  it("returns the parent of an absolute path", () => {
    expect(getParentPath("/data/file.fastq")).toBe("/data");
  });

  // Verifies a root-level or missing file navigates to the browser root.
  it.each(["file.fastq", "", undefined])("returns the root for %s", (path) => {
    expect(getParentPath(path)).toBe("");
  });
});

describe("getBreadcrumbItems", () => {
  // Verifies the browser root does not create an empty breadcrumb item.
  it.each(["", "/", undefined])("returns no items for the root %s", (path) => {
    expect(getBreadcrumbItems(path)).toEqual([]);
  });

  // Verifies each breadcrumb contains its cumulative navigation path.
  it("creates breadcrumb items for a nested path", () => {
    expect(getBreadcrumbItems("data/project/run")).toEqual([
      { name: "data", rel_path: "data" },
      { name: "project", rel_path: "data/project" },
      { name: "run", rel_path: "data/project/run" },
    ]);
  });

  // Verifies accidental leading and trailing slashes are normalized.
  it("ignores empty path segments", () => {
    expect(getBreadcrumbItems("/data/project/")).toEqual([
      { name: "data", rel_path: "data" },
      { name: "project", rel_path: "data/project" },
    ]);
  });
});

describe("encodeFileSize", () => {
  // Verifies empty size values are displayed as zero Bytes.
  it.each([0, null, undefined])("encodes %s as zero Bytes", (bytes) => {
    expect(encodeFileSize(bytes)).toEqual({ size: 0, units: "Bytes" });
  });

  // Verifies byte counts are converted to readable binary units.
  it.each([
    [1, { size: 1, units: "Bytes" }],
    [1024, { size: 1, units: "KB" }],
    [1536, { size: 1.5, units: "KB" }],
    [1048576, { size: 1, units: "MB" }],
  ])("encodes %s bytes", (bytes, expected) => {
    expect(encodeFileSize(bytes)).toEqual(expected);
  });

  // Verifies an unlimited maximum is represented by the largest UI value.
  it("encodes Infinity as the unlimited size option", () => {
    expect(encodeFileSize(Infinity)).toEqual({ size: 1023, units: "TB" });
  });
});

describe("decodeFileSize", () => {
  // Verifies empty form values are stored as zero bytes.
  it.each([0, null, undefined, ""])("decodes %s as zero", (size) => {
    expect(decodeFileSize(size, "Bytes")).toBe(0);
  });

  // Verifies selected units are converted back to bytes.
  it.each([
    [1, "Bytes", 1],
    [1, "KB", 1024],
    [1, "MB", 1048576],
  ])("decodes %s %s", (size, units, expected) => {
    expect(decodeFileSize(size, units)).toBe(expected);
  });

  // Verifies decimal values are not truncated during conversion.
  it("preserves decimal file sizes", () => {
    expect(decodeFileSize(1.5, "KB")).toBe(1536);
  });

  // Verifies the largest selectable value restores an unlimited maximum.
  it("decodes the unlimited size option as Infinity", () => {
    expect(decodeFileSize(1023, "TB")).toBe(Infinity);
  });

  // Verifies an unexpected unit cannot produce an invalid byte value.
  it("returns zero for an unknown unit", () => {
    expect(decodeFileSize(1, "unknown")).toBe(0);
  });
});

describe("getFileExtension", () => {
  // Verifies the final suffix is used as the displayed file extension.
  it.each([
    ["sample.fastq", "fastq"],
    ["archive.tar.gz", "gz"],
    ["README", ""],
    ["file.", ""],
  ])("extracts the extension from %s", (name, expected) => {
    expect(getFileExtension(name)).toBe(expected);
  });
});

describe("createFileTableRows", () => {
  // Verifies API file data is converted into the values displayed by the table.
  it("creates sortable rows for directories and files", () => {
    const files = [
      { id: "directory-1", name: "data", filetype: "directory" },
      { id: "file-1", name: "sample.fastq.gz", filetype: "file" },
    ];

    expect(createFileTableRows(files)).toEqual([
      {
        ...files[0],
        filetype: "directory",
        typeSortableName: { name: "data", filetype: "directory" },
      },
      {
        ...files[1],
        filetype: ".gz",
        typeSortableName: { name: "sample.fastq.gz", filetype: "file" },
      },
    ]);
  });

  // Verifies a missing file list safely creates an empty table.
  it("returns no rows when files are missing", () => {
    expect(createFileTableRows()).toEqual([]);
  });
});

describe("compareFileNames", () => {
  // Verifies entries of the same type are sorted by name.
  it.each([
    ["alpha", "beta", -1],
    ["beta", "alpha", 1],
    ["alpha", "alpha", 0],
  ])("compares %s with %s", (firstName, secondName, expected) => {
    expect(
      compareFileNames(
        { name: firstName, filetype: "file" },
        { name: secondName, filetype: "file" },
      ),
    ).toBe(expected);
  });

  // Verifies directories appear before files in ascending order.
  it("sorts a directory before a file", () => {
    expect(
      compareFileNames(
        { name: "directory", filetype: "directory" },
        { name: "file", filetype: "file" },
      ),
    ).toBe(-1);
  });

  // Verifies the inverse comparison places a file after a directory.
  it("sorts a file after a directory", () => {
    expect(
      compareFileNames(
        { name: "file", filetype: "file" },
        { name: "directory", filetype: "directory" },
      ),
    ).toBe(1);
  });
});
