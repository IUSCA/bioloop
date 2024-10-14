import api from "../api";

class GlobusAuthService {
  getToken(data) {
    return api.post("/globus/token", data);
  }
}

export default new GlobusAuthService();
