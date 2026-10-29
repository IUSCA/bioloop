import { describe, expect, it } from "vitest";

import { parseEnabledRoles } from "./runtimeConfig";

describe("parseEnabledRoles", () => {
  it("uses admin as the safe default", () => {
    expect(parseEnabledRoles(undefined)).toEqual(["admin"]);
  });

  it("parses an instance-specific comma-separated role list", () => {
    expect(parseEnabledRoles("admin,operator,user")).toEqual([
      "admin",
      "operator",
      "user",
    ]);
  });

  it("normalizes whitespace, case, and duplicates", () => {
    expect(parseEnabledRoles(" Admin, operator,ADMIN ")).toEqual([
      "admin",
      "operator",
    ]);
  });

  it("ignores unknown roles", () => {
    expect(parseEnabledRoles("admin,unknown,user")).toEqual(["admin", "user"]);
  });

  it("falls back safely when no valid role is provided", () => {
    expect(parseEnabledRoles("unknown")).toEqual(["admin"]);
  });
});
