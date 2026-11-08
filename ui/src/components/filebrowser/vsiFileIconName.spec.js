import { describe, expect, it } from "vitest";

import { getVsiFileIconName } from "./vsiFileIconName";

describe("getVsiFileIconName", () => {
  // Verifies common extensions map to their expected file-type icons.
  it.each([
    ["analysis.py", "python"],
    ["report.pdf", "pdf2"],
    ["data.csv", "text"],
  ])("returns the matching icon for %s", (filename, expected) => {
    expect(getVsiFileIconName(filename)).toBe(expected);
  });

  // Verifies uppercase and lowercase extensions produce the same icon.
  it("matches extensions without case sensitivity", () => {
    expect(getVsiFileIconName("REPORT.PDF")).toBe("pdf2");
  });

  // Verifies special filenames take priority over their final extension.
  it("prefers a known full filename over its extension", () => {
    expect(getVsiFileIconName("package.json")).toBe("npm");
  });

  // Verifies hidden configuration files can be matched by full name.
  it("recognizes dotfiles", () => {
    expect(getVsiFileIconName(".gitignore")).toBe("git");
  });

  // Verifies matching continues through multi-part file extensions.
  it("recognizes compound extensions", () => {
    expect(getVsiFileIconName("template.blade.php")).toBe("blade");
  });

  // Verifies unsupported or missing names use the safe fallback icon.
  it.each([undefined, null, "", "unknown.extension"])(
    "returns the generic file icon for %s",
    (filename) => {
      expect(getVsiFileIconName(filename)).toBe("file");
    },
  );
});
