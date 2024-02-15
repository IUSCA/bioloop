import api from "./api";

class AboutService {
  getLatest() {
    return api.get("/about/latest");
  }

  createOrUpdate({ id, data }) {
    return id ? api.patch(`/about/${id}`, data) : api.put("/about", data);
  }
}

export default new AboutService();
