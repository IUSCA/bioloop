import api from "./api";

class AboutService {
  getAll() {
    return api.get("/about");
  }
}

export default new AboutService();
