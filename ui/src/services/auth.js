import api from "./api";
import config from "../config";

class AuthService {
  casVerify(casTicket) {
    return api.post("/auth/cas/verify", {
      service: config.casReturn,
      ticket: casTicket,
    });
  }

  getCasUrl(service) {
    return api.get("/auth/cas/url", {
      params: {
        service: service,
      },
    });
  }

  saveSettings = (data) => api.put("/users/mine/settings", data);
}

export default new AuthService();
