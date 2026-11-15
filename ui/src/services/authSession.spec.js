import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const normalLogin = {
  profile: { username: "admin", roles: ["admin"] },
  token: "normal-token",
};
const spoofLogin = {
  profile: { username: "user-a", roles: ["user"] },
  token: "spoof-token",
};

let session;
let useAuthSession;

async function resetSession() {
  session.saveSession({ profile: {}, token: "" }, { spoof: false });
  await nextTick();
  localStorage.clear();
  sessionStorage.clear();
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
  ({ useAuthSession } = await import("./authSession"));
});

afterEach(async () => {
  if (session) await resetSession();
  session = undefined;
});

describe("Auth session storage selection", () => {
  beforeEach(async () => {
    session = useAuthSession();
    await nextTick();
  });

  it("stores a normal login in shared localStorage", async () => {
    session.saveSession(normalLogin, { spoof: false });
    await nextTick();

    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(sessionStorage.getItem("auth.spoof")).toBeNull();
    expect(session.user.value).toEqual(normalLogin.profile);
    expect(session.token.value).toBe(normalLogin.token);
    expect(session.isSpoofing.value).toBe(false);
  });

  it("stores a spoof login in sessionStorage and preserves the normal login", async () => {
    session.saveSession(normalLogin, { spoof: false });
    await nextTick();

    session.saveSession(spoofLogin, { spoof: true });

    expect(JSON.parse(sessionStorage.getItem("auth.spoof"))).toEqual(
      spoofLogin,
    );
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(session.user.value).toEqual(spoofLogin.profile);
    expect(session.token.value).toBe(spoofLogin.token);
    expect(session.isSpoofing.value).toBe(true);
  });

  it("keeps a refreshed spoof token in sessionStorage", async () => {
    session.saveSession(normalLogin, { spoof: false });
    await nextTick();
    session.saveSession(spoofLogin, { spoof: true });
    const refreshedLogin = { ...spoofLogin, token: "refreshed-spoof-token" };

    session.saveSession(refreshedLogin);

    expect(JSON.parse(sessionStorage.getItem("auth.spoof"))).toEqual(
      refreshedLogin,
    );
    expect(session.token.value).toBe(refreshedLogin.token);
    expect(session.isSpoofing.value).toBe(true);
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
  });
});

describe("Auth session cleanup", () => {
  beforeEach(async () => {
    session = useAuthSession();
    await nextTick();
  });

  it("clears only the spoof session and restores the normal login", async () => {
    session.saveSession(normalLogin, { spoof: false });
    await nextTick();
    session.saveSession(spoofLogin, { spoof: true });
    sessionStorage.setItem("draft", "unsaved changes");

    session.clearSession();

    // Removal must finish before the caller reloads the page.
    expect(sessionStorage.getItem("auth.spoof")).toBeNull();
    expect(sessionStorage.getItem("draft")).toBe("unsaved changes");
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
    expect(session.user.value).toEqual(normalLogin.profile);
    expect(session.token.value).toBe(normalLogin.token);
    expect(session.isSpoofing.value).toBe(false);
  });

  it("clears normal credentials without deleting unrelated storage", async () => {
    session.saveSession(normalLogin, { spoof: false });
    await nextTick();
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("draft", "unsaved changes");

    session.clearSession();
    await nextTick();

    expect(session.user.value).toEqual({});
    expect(session.token.value).toBe("");
    expect(localStorage.getItem("token")).toBe("");
    expect(JSON.parse(localStorage.getItem("user"))).toEqual({});
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(sessionStorage.getItem("draft")).toBe("unsaved changes");
  });

  it("preserves the spoof session when another tab clears the normal login", async () => {
    session.saveSession(normalLogin, { spoof: false });
    await nextTick();
    session.saveSession(spoofLogin, { spoof: true });

    // A browser sends storage events to other tabs, not the tab doing the write.
    for (const [key, value] of [
      ["token", ""],
      ["user", "{}"],
    ]) {
      const oldValue = localStorage.getItem(key);
      localStorage.setItem(key, value);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          oldValue,
          newValue: value,
          storageArea: localStorage,
        }),
      );
    }
    await nextTick();

    expect(session.isSpoofing.value).toBe(true);
    expect(session.user.value).toEqual(spoofLogin.profile);
    expect(session.token.value).toBe(spoofLogin.token);
    expect(JSON.parse(sessionStorage.getItem("auth.spoof"))).toEqual(
      spoofLogin,
    );

    session.clearSession();

    expect(session.isSpoofing.value).toBe(false);
    expect(session.user.value).toEqual({});
    expect(session.token.value).toBe("");
  });
});

describe("Auth session restoration", () => {
  beforeEach(() => {
    localStorage.setItem("user", JSON.stringify(normalLogin.profile));
    localStorage.setItem("token", normalLogin.token);
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("draft", "unsaved changes");
  });

  it.each([
    ["missing profile", { token: spoofLogin.token }],
    ["missing token", { profile: spoofLogin.profile }],
    [
      "invalid role",
      {
        ...spoofLogin,
        profile: { ...spoofLogin.profile, roles: [null] },
      },
    ],
    [
      "blank username",
      {
        ...spoofLogin,
        profile: { ...spoofLogin.profile, username: " " },
      },
    ],
  ])(
    "discards a stored session with %s and restores the normal login",
    (_name, data) => {
      sessionStorage.setItem("auth.spoof", JSON.stringify(data));

      session = useAuthSession();

      expect(sessionStorage.getItem("auth.spoof")).toBeNull();
      expect(session.isSpoofing.value).toBe(false);
      expect(session.user.value).toEqual(normalLogin.profile);
      expect(session.token.value).toBe(normalLogin.token);
      expect(JSON.parse(localStorage.getItem("user"))).toEqual(
        normalLogin.profile,
      );
      expect(localStorage.getItem("token")).toBe(normalLogin.token);
      expect(localStorage.getItem("theme")).toBe("dark");
      expect(sessionStorage.getItem("draft")).toBe("unsaved changes");
    },
  );

  it.each([
    ["user role", spoofLogin],
    [
      "no roles",
      { ...spoofLogin, profile: { ...spoofLogin.profile, roles: [] } },
    ],
  ])("restores a valid stored spoof session with %s", (_name, data) => {
    sessionStorage.setItem("auth.spoof", JSON.stringify(data));

    session = useAuthSession();

    expect(session.isSpoofing.value).toBe(true);
    expect(session.user.value).toEqual(data.profile);
    expect(session.token.value).toBe(data.token);
    expect(JSON.parse(sessionStorage.getItem("auth.spoof"))).toEqual(data);
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
  });

  it("falls back to logged out when both the stored spoof and normal login are unavailable", () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    sessionStorage.setItem("auth.spoof", JSON.stringify({ token: "token" }));

    session = useAuthSession();

    expect(session.isSpoofing.value).toBe(false);
    expect(session.user.value).toEqual({});
    expect(session.token.value).toBe("");
    expect(sessionStorage.getItem("auth.spoof")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
