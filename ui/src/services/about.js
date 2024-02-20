import api from "./api";

class AboutService {
  getLatest() {
    return api.get("/about/latest");
  }

  createOrUpdate({ id, data }) {
    return id ? api.put(`/about/${id}`, data) : api.post("/about", data);
  }
}

export default new AboutService();
