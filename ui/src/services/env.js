import api from "./api";

class EnvironmentService {
  getEnvironment() {
    return api.get("/env");
  }
}

export default new EnvironmentService();
