import { jwtDecode } from "jwt-decode";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import config from "@/config";
import constants from "@/constants";
import authService from "@/services/auth";
import { useAuthStore } from "@/stores/auth";

const { resetSession } = vi.hoisted(() => ({
  resetSession: vi.fn(),
}));

// onLogin always decodes the token to schedule a refresh. Test tokens are not
// real JWTs, so return an already-expired payload and skip that timer.
vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(() => ({ exp: 0 })),
}));

// Replace the HTTP auth client. Tests stub return values where needed
// (saveSettings, spoof) so nothing hits the API.
vi.mock("@/services/auth", () => ({
  default: {
    refreshToken: vi.fn(),
    saveSettings: vi.fn(),
    spoof: vi.fn(),
  },
}));

// onLogin/onLogout call notificationStore.resetSession(). Keep auth isolated
// from toast/notification API setup.
vi.mock("@/stores/notification", () => ({
  useNotificationStore: () => ({
    resetSession,
  }),
}));

const statuses = constants.auth.verify.response.status;
const REFRESH_LEAD_MS = config.refreshTokenTMinusSeconds.appToken * 1000;

function loginAs(store, roles) {
  store.onLogin({
    profile: { username: "elijah", roles },
    token: "token",
  });
}

function mockTokenExpiringIn(ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  vi.mocked(jwtDecode).mockReturnValue({ exp });
  return ttlSeconds * 1000 - REFRESH_LEAD_MS;
}

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    vi.mocked(jwtDecode).mockReturnValue({ exp: 0 });

  });

  // -- Auth state --

  describe("Auth state", () => {
    it("starts logged out", () => {
      const store = useAuthStore();

      expect(store.loggedIn).toBe(false);
      expect(store.user).toEqual({});
      expect(store.token).toBe("");
    });

    it("login and logout", () => {
      const store = useAuthStore();

      loginAs(store, ["user"]);
      expect(store.loggedIn).toBe(true);
      expect(store.user.username).toBe("elijah");
      expect(store.token).toBe("token");

      store.logout();
      expect(store.loggedIn).toBe(false);
      expect(store.user).toEqual({});
      expect(store.token).toBe("");
    });

    it("initialize with token", () => {
      const store = useAuthStore();
      loginAs(store, ["user"]);
      store.loggedIn = false;

      store.initialize();
      expect(store.loggedIn).toBe(true);
    });

    it("initialize without token", () => {
      const store = useAuthStore();
      store.user = { username: "elijah" };

      store.initialize();
      expect(store.loggedIn).toBe(false);
    });
  });

  // -- Token refresh --

  describe("Token refresh", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.mocked(jwtDecode).mockReturnValue({ exp: 0 });
      authService.refreshToken.mockResolvedValue({});
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("schedules refresh before token expiry", async () => {
      const refreshDelay = mockTokenExpiringIn(3600);
      const store = useAuthStore();

      loginAs(store, ["user"]);

      expect(authService.refreshToken).not.toHaveBeenCalled();

      vi.advanceTimersByTime(refreshDelay);
      await vi.runAllTimersAsync();

      expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    });

    it("schedules refresh on initialize with a stored token", async () => {
      const refreshDelay = mockTokenExpiringIn(3600);
      const store = useAuthStore();
      store.user = { username: "elijah", roles: ["user"] };
      store.token = "token";

      store.initialize();

      vi.advanceTimersByTime(refreshDelay);
      await vi.runAllTimersAsync();

      expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    });

    it("does not schedule refresh when the token is already expired", () => {
      const store = useAuthStore();

      loginAs(store, ["user"]);

      expect(authService.refreshToken).not.toHaveBeenCalled();
    });

    it("does not schedule a second timer on repeat login", async () => {
      const refreshDelay = mockTokenExpiringIn(3600);
      const store = useAuthStore();

      loginAs(store, ["user"]);
      loginAs(store, ["user"]);

      vi.advanceTimersByTime(refreshDelay);
      await vi.runAllTimersAsync();

      expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    });

    it("refresh success updates the session", async () => {
      const ttlSeconds = 3600;
      const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
      const refreshDelay = ttlSeconds * 1000 - REFRESH_LEAD_MS;
      vi.mocked(jwtDecode)
        .mockReturnValueOnce({ exp })
        .mockReturnValue({ exp: 0 });
      authService.refreshToken.mockResolvedValue({
        data: {
          profile: { username: "refreshed", roles: ["admin"] },
          token: "new-token",
        },
      });
      const store = useAuthStore();

      loginAs(store, ["user"]);

      vi.advanceTimersByTime(refreshDelay);
      await vi.runAllTimersAsync();

      expect(store.user.username).toBe("refreshed");
      expect(store.token).toBe("new-token");
      expect(store.canAdmin).toBe(true);
    });

    it("refresh failure logs an error", async () => {
      const refreshDelay = mockTokenExpiringIn(3600);
      const error = new Error("401");
      authService.refreshToken.mockRejectedValue(error);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const store = useAuthStore();

      loginAs(store, ["user"]);

      vi.advanceTimersByTime(refreshDelay);
      await vi.runAllTimersAsync();

      expect(spy).toHaveBeenCalledWith("Unable to refresh token", error);
      spy.mockRestore();
    });
  });

  // -- Roles & authorization --

  describe("Roles & authorization", () => {
    it.each([
      ["user", false, false],
      ["operator", false, true],
      ["admin", true, true],
    ])("%s has the expected permissions", (role, canAdmin, canOperate) => {
      const store = useAuthStore();

      loginAs(store, [role]);

      expect(store.canAdmin).toBe(canAdmin);
      expect(store.canOperate).toBe(canOperate);
    });

    it.each([
      [[], false, false],
      [undefined, false, false],
    ])(
      "user without roles has no permissions (%s)",
      (roles, canAdmin, canOperate) => {
        const store = useAuthStore();
        store.onLogin({
          profile: { username: "elijah", ...(roles !== undefined && { roles }) },
          token: "token",
        });

        expect(store.canAdmin).toBe(canAdmin);
        expect(store.canOperate).toBe(canOperate);
        expect(store.hasRole("admin")).toBe(false);
      },
    );

    it.each([
      [["user", "operator"], false, true],
      [["user", "admin"], true, true],
    ])(
      "multiple roles %j combine permissions",
      (roles, canAdmin, canOperate) => {
        const store = useAuthStore();

        loginAs(store, roles);

        expect(store.canAdmin).toBe(canAdmin);
        expect(store.canOperate).toBe(canOperate);
      },
    );

    it("matches roles case-insensitively", () => {
      const store = useAuthStore();
      loginAs(store, ["ADMIN"]);

      expect(store.hasRole("admin")).toBe(true);
      expect(store.canAdmin).toBe(true);
    });

    it("feature gates", () => {
      const store = useAuthStore();

      loginAs(store, ["user"]);
      expect(store.isFeatureEnabled("uploads")).toBe(false);

      loginAs(store, ["admin"]);
      expect(store.isFeatureEnabled("uploads")).toBe(true);
      expect(store.isFeatureEnabled("notifications")).toBe(false);
    });
  });

  // -- Signup data --

  describe("Signup data", () => {
    it("clearSignupData clears stored signup token and email", () => {
      const store = useAuthStore();

      store.signupToken = "signup";
      store.signupEmail = "e@iu.edu";

      store.clearSignupData();

      expect(store.signupToken).toBe("");
      expect(store.signupEmail).toBe("");
    });
  });

  // -- Verification responses --

  describe("Verification responses", () => {
    it("SUCCESS: logs in when verification succeeds", async () => {
      const store = useAuthStore();
      const verify = store.withHandledVerifyResponse(() =>
        Promise.resolve({
          data: {
            status: statuses.SUCCESS,
            profile: { username: "elijah", roles: ["user"] },
            token: "token",
          },
        }),
      );

      await expect(verify()).resolves.toBe(statuses.SUCCESS);
      expect(store.loggedIn).toBe(true);
      expect(store.user.username).toBe("elijah");
    });

    it("SIGNUP_REQUIRED: stores signup data when signup is required", async () => {
      const store = useAuthStore();
      const verify = store.withHandledVerifyResponse(() =>
        Promise.resolve({
          data: {
            status: statuses.SIGNUP_REQUIRED,
            signup_token: "signup",
            email: "e@iu.edu",
          },
        }),
      );

      await expect(verify()).resolves.toBe(statuses.SIGNUP_REQUIRED);
      expect(store.loggedIn).toBe(false);
      expect(store.signupToken).toBe("signup");
      expect(store.signupEmail).toBe("e@iu.edu");
    });

    it("NOT_A_USER: stays logged out when the account is not a user", async () => {
      const store = useAuthStore();
      const verify = store.withHandledVerifyResponse(() =>
        Promise.resolve({
          data: { status: statuses.NOT_A_USER },
        }),
      );

      await expect(verify()).resolves.toBe(statuses.NOT_A_USER);
      expect(store.loggedIn).toBe(false);
    });

    it("malformed verify response", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const store = useAuthStore();
      loginAs(store, ["user"]);

      const verify = store.withHandledVerifyResponse(() => Promise.resolve({}));

      await expect(verify()).rejects.toBeUndefined();
      expect(store.loggedIn).toBe(false);
      expect(spy).toHaveBeenCalledWith(
        "Unexpected response from the verify API",
        {},
      );
      spy.mockRestore();
    });

    it("unexpected status", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const store = useAuthStore();
      loginAs(store, ["user"]);

      const verify = store.withHandledVerifyResponse(() =>
        Promise.resolve({ data: { status: "nope" } }),
      );

      await expect(verify()).rejects.toBeUndefined();
      expect(store.loggedIn).toBe(false);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("request failure", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const store = useAuthStore();
      loginAs(store, ["user"]);

      const verify = store.withHandledVerifyResponse(() =>
        Promise.reject(new Error("network")),
      );

      await expect(verify()).rejects.toBeUndefined();
      expect(store.loggedIn).toBe(false);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // -- Notification session --

  describe("Notification session", () => {
    it("resets notifications on login", () => {
      const store = useAuthStore();

      loginAs(store, ["user"]);

      expect(resetSession).toHaveBeenCalledTimes(1);
    });

    it("resets notifications on logout", () => {
      const store = useAuthStore();

      loginAs(store, ["user"]);
      resetSession.mockClear();

      store.logout();

      expect(resetSession).toHaveBeenCalledTimes(1);
    });
  });

  // -- Account operations --

  describe("Account operations", () => {
    it("saveSettings: updates user settings after saving", async () => {
      const store = useAuthStore();
      loginAs(store, ["user"]);
      authService.saveSettings.mockResolvedValue({
        data: { settings: { digest: true } },
      });

      await store.saveSettings({ digest: true });
      expect(store.user.settings).toEqual({ digest: true });
    });

    it("saveSettings failure leaves settings unchanged", async () => {
      const store = useAuthStore();
      loginAs(store, ["user"]);
      store.user.settings = { digest: false };
      authService.saveSettings.mockRejectedValue(new Error("save failed"));

      await expect(store.saveSettings({ digest: true })).rejects.toThrow(
        "save failed",
      );
      expect(store.user.settings).toEqual({ digest: false });
    });

    it("spoof: switches to the spoofed user and redirects", async () => {
      const store = useAuthStore();
      authService.spoof.mockResolvedValue({
        data: {
          profile: { username: "other", roles: ["admin"] },
          token: "spoofed",
        },
      });
      const location = { href: "" };
      vi.stubGlobal("location", location);

      await store.spoof("other");

      expect(store.user.username).toBe("other");
      expect(store.canAdmin).toBe(true);
      expect(location.href).toBe("/");
      vi.unstubAllGlobals();
    });

    it("spoof failure leaves the current session unchanged", async () => {
      const store = useAuthStore();
      loginAs(store, ["user"]);
      authService.spoof.mockRejectedValue(new Error("forbidden"));

      await expect(store.spoof("other")).rejects.toThrow("forbidden");
      expect(store.user.username).toBe("elijah");
      expect(store.token).toBe("token");
    });
  });
});
