import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import authService from "@/services/auth";
import { useAuthSession } from "@/services/authSession";
import { useAuthStore } from "./auth";

// Keep storage and the auth store real; replace network and notification work.
vi.mock("@/services/auth", () => ({
  default: { spoof: vi.fn() },
}));

vi.mock("@/stores/notification", () => ({
  useNotificationStore: () => ({ resetSession: vi.fn() }),
}));

function loginData(username, roles) {
  // The UI decodes expiration only; this fixture is not a server credential.
  const token = [
    btoa(JSON.stringify({ alg: "none", typ: "JWT" })),
    btoa(
      JSON.stringify({
        sub: username,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
    "test",
  ].join(".");
  return { profile: { username, roles }, token };
}

let store;
let session;
let normalLogin;
let spoofLogin;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  setActivePinia(createPinia());
  session = useAuthSession();
  session.saveSession({ profile: {}, token: "" }, { spoof: false });
  await nextTick();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/users");
  normalLogin = loginData("admin", ["admin"]);
  spoofLogin = loginData("user-a", ["user"]);
  store = useAuthStore();
});

afterEach(async () => {
  store.$dispose();
  session.saveSession({ profile: {}, token: "" }, { spoof: false });
  await nextTick();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Auth store storage selection", () => {
  it("saves a normal login to localStorage", async () => {
    store.onLogin(normalLogin);
    await nextTick();

    expect(store.loggedIn).toBe(true);
    expect(store.isSpoofing).toBe(false);
    expect(store.user).toEqual(normalLogin.profile);
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
    expect(sessionStorage.getItem("auth.spoof")).toBeNull();
  });

  it("saves the Log in as response to sessionStorage and keeps the admin login", async () => {
    store.onLogin(normalLogin);
    await nextTick();
    authService.spoof.mockResolvedValueOnce({ data: spoofLogin });

    await store.spoof("user-a");

    expect(authService.spoof).toHaveBeenCalledWith("user-a", {
      token: normalLogin.token,
      spoof: false,
    });
    expect(store.user).toEqual(spoofLogin.profile);
    expect(store.token).toBe(spoofLogin.token);
    expect(store.isSpoofing).toBe(true);
    expect(store.canAdmin).toBe(false);
    expect(JSON.parse(sessionStorage.getItem("auth.spoof"))).toEqual(
      spoofLogin,
    );
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
  });
});

describe("Auth store session cleanup", () => {
  it("ends Log in as and returns to the preserved admin login", async () => {
    store.onLogin(normalLogin);
    await nextTick();
    store.onLogin(spoofLogin, { spoof: true });
    localStorage.setItem("theme", "dark");

    store.logout();

    expect(store.isSpoofing).toBe(false);
    expect(store.loggedIn).toBe(true);
    expect(store.user).toEqual(normalLogin.profile);
    expect(store.token).toBe(normalLogin.token);
    expect(store.canAdmin).toBe(true);
    expect(sessionStorage.getItem("auth.spoof")).toBeNull();
    expect(localStorage.getItem("token")).toBe(normalLogin.token);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(
      normalLogin.profile,
    );
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(window.location.pathname).toBe("/");
  });

  it("logs out a normal session without clearing unrelated storage", async () => {
    store.onLogin(normalLogin);
    await nextTick();
    localStorage.setItem("theme", "dark");
    sessionStorage.setItem("draft", "unsaved changes");

    store.logout();
    await nextTick();

    expect(store.loggedIn).toBe(false);
    expect(store.isSpoofing).toBe(false);
    expect(store.user).toEqual({});
    expect(store.token).toBe("");
    expect(localStorage.getItem("token")).toBe("");
    expect(JSON.parse(localStorage.getItem("user"))).toEqual({});
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(sessionStorage.getItem("draft")).toBe("unsaved changes");
  });
});
