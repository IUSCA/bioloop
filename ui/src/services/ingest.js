import api from "./api";

class IngestionService {
  getPathFiles({ path, dirs_only }) {
    return api.get("/ingest", { params: { path, dirs_only } });
  }
}

export default new IngestionService();
