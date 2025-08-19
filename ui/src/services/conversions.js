import api from "./api";

class ConversionService {
  getAllDefinitions() {
    return api.get("/conversions/definitions");
  }

  getDefinition(id) {
    return api.get(`/conversions/definitions/${id}`);
  }

  getAll() {
    return api.get("/conversions");
  }

  get(id) {
    return api.get(`/conversions/${id}`);
  }

  create(conversion) {
    return api.post("/conversions", conversion);
  }

  createBulk(data) {
    return api.post("/conversions/bulk", data);
  }
}

export default new ConversionService();
