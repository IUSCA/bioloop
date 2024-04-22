import api from "./api";

class FeatureFlagService {
  getAll() {
    return api.get("/features");
  }
}

export default new FeatureFlagService();
