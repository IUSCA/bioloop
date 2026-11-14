import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useAuthSession } from "./authSession";

const normalLogin = {
  profile: { username: "admin", roles: ["admin"] },
  token: "normal-token",
};
const spoofLogin = {
  profile: { username: "user-a", roles: ["user"] },
  token: "spoof-token",
};

let session;

async function resetSession() {
  session.saveSession({ profile: {}, token: "" }, { spoof: false });
  await nextTick();
  localStorage.clear();
  sessionStorage.clear();
}

beforeEach(async () => {
  session = useAuthSession();
  await resetSession();
});

afterEach(resetSession);

describe("Auth session storage selection", () => {
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
