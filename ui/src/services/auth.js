import api from "./api";
import config from "../config";

class AuthService {
  login(casTicket) {
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
}

export default new AuthService();
