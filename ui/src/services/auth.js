import api from "./api";
import config from "@/config";

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
}

export default new AuthService();
