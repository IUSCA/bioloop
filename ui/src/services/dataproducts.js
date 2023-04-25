import api from "./api";

class DataProductService {
  getAll({ only_deleted = false } = {}) {
    return api.get("/data_products/", {
      params: {
        only_deleted,
      },
    });
  }
  getById({ id, workflows = true }) {
    return api.get(`/data_products/${id}`, {
      params: {
        workflows,
      },
    });
  }
}

export default new DataProductService();
