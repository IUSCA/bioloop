import api from "./api";

class RawDataService {
  getAll({ only_deleted = false } = {}) {
    return api.get("/raw_data/", {
      params: {
        only_deleted,
      },
    });
  }
  getById({ id, workflows = true }) {
    return api.get(`/raw_data/${id}`, {
      params: {
        workflows,
      },
    });
  }

  getStats() {
    return api.get("/raw_data/stats");
  }
}

export default new RawDataService();
