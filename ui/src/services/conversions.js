import api from "./api";

class ConversionService {
  getAllDefinitions() {
    return api.get("/conversions/definitions");
  }

  getDefinition(id) {
    return api.get(`/conversions/definitions/${id}`);
  }

  getAll(params = {}) {
    return api.get("/conversions", { params });
  }

  get(
    id,
    params = {
      include_dataset: false,
      include_derived_datasets: false,
    },
  ) {
    return api.get(`/conversions/${id}`, { params });
  }

  create(conversion) {
    return api.post("/conversions", conversion);
  }

  createBulk(data) {
    return api.post("/conversions/bulk", data);
  }

  getDerivedDatasets(id, params = {}) {
    return api.get(`/conversions/${id}/derived_datasets`, { params });
  }
}

export default new ConversionService();
