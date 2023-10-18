import api from "./api";

class MetricsService {
  getLatest() {
    return api.get("/metrics/latest").then((res) => {
      res.data.forEach((metric) => {
        // try to convert 'limit' and 'usage' to numbers
        if (!isNaN(metric?.limit)) metric.limit = Number(metric.limit);
        if (!isNaN(metric?.usage)) metric.usage = Number(metric.usage);
      });
      return res;
    });
  }

  getSpaceUtilizationByTimeAndMeasurement(measurement) {
    return api.get("/metrics/space-utilization-by-timestamp", {
      params: {
        measurement,
      },
    });
  }
}

export default new MetricsService();
