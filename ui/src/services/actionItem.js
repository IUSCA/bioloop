import api from "./api";

class ActionItemService {
  getLatest({ type, dataset_id, active = true } = {}) {
    return api.get("/action-items", {
      params: {
        type,
        active,
        dataset_id,
      },
    });
  }

  createOrUpdate({ id, data }) {
    return id ? api.put(`/about/${id}`, data) : api.post("/about", data);
  }
}

export default new ActionItemService();
