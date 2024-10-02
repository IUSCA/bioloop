import api from "./api";

class IngestionService {
  getPathFiles({ path }) {
    return api.get("/ingest", { params: { path } });
  }
}

export default new IngestionService();
