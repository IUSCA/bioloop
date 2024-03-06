import api from "./api";

class IngestionService {
  getActionItems({
    type,
    original_dataset_id,
    active = true,
    acknowledged_by_id,
  } = {}) {
    return api.get("/ingestion/action-items", {
      params: {
        type,
        active,
        original_dataset_id,
        acknowledged_by_id,
      },
    });
  }
}

export default new IngestionService();
