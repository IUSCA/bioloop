import api from "./api";

class FeatureFlagService {
  getAll() {
    return api.get("/features");
  }

  updateFeatureFlag(id, data) {
    return api.patch(`/features/${id}`, data);
  }

  createFeatureFlag(label, enabled) {
    return api.post(`/features/`, {
      label,
      enabled,
    });
  }
}

export default new FeatureFlagService();
