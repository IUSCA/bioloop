import api from "./api";

class MetricsService {
  getLatest() {
    return api.get("/metrics/latest");
  }
}

export default new MetricsService();
