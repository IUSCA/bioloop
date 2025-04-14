import config from "@/config";
import api from "./api";

class AuthService {
  casVerify(casTicket) {
    return api.post("/auth/cas/verify", {
      service: config.casReturn,
      ticket: casTicket,
    });
  }

  getCasUrl() {
    return api.get("/auth/cas/url", {
      params: {
        service: config.casReturn,
      },
    });
  }

  saveSettings = (data) => api.put("/users/mine/settings", data);

  refreshToken = () => api.post("/auth/refresh_token");

  spoof = (username) => api.post(`/auth/spoof/${username}`);

  getGoogleUrl() {
    return api.get("/auth/google/url", {
      params: {
        redirect_uri: config.googleReturn,
      },
    });
  }

  googleVerify({ code, state }) {
    return api.post("/auth/google/verify", {
      redirect_uri: config.googleReturn,
      code,
      state,
    });
  }

  getCiUrl() {
    return api.get("/auth/cilogon/url", {
      params: {
        redirect_uri: config.cilogonReturn,
      },
    });
  }

  ciVerify({ code }) {
    return api.post("/auth/cilogon/verify", {
      redirect_uri: config.cilogonReturn,
      code,
    });
  }

  getMicrosoftUrl() {
    return api.get("/auth/microsoft/url", {
      params: {
        redirect_uri: config.microsoftReturn,
      },
    });
  }

  microsoftVerify({ code, code_verifier }) {
    return api.post("/auth/microsoft/verify", {
      redirect_uri: config.microsoftReturn,
      code,
      code_verifier,
    });
  }
}

export default new AuthService();
