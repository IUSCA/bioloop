import api from "./api";

class AboutService {
  getAll() {
    return api.get("/about");
  }

  create(data) {
    return api.post("/about", data);
  }
}

export default new AboutService();
