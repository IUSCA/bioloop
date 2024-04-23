import api from "./api";

class FeatureFlagService {
  getAll() {
    return api.get("/features");
  }

  updateFeatureFlag(id, data) {
    return api.patch(`/features/${id}`, data);
  }
}

export default new FeatureFlagService();
