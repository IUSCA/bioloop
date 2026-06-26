import api from "./api";

class NotebooksService {
  launchNotebook(nextPath) {
    return api.post("/notebooks/launch", { next: nextPath });
  }
}

export default new NotebooksService();
