import api from "./api";

class AboutService {
  getLatest() {
    return api.get("/about_latest");
  }

  createOrUpdate({ id, data }) {
    return id ? api.patch(`/about/${id}`, data) : api.post("/about", data);
  }
}

export default new AboutService();
