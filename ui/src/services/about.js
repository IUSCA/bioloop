import api from "./api";

class AboutService {
  getAll() {
    return api.get("/about");
  }

  createOrUpdate({ id, data }) {
    return id ? api.patch(`/about/${id}`, data) : api.post("/about", data);
  }
}

export default new AboutService();
