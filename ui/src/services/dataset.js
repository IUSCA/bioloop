import api from "./api";

class DatasetService {
  getAll({ deleted = null, processed = null, type = null } = {}) {
    return api.get("/datasets", {
      params: {
        deleted,
        processed,
        type,
      },
    });
  }

  getById({
    id,
    checksums = false,
    workflows = true,
    last_task_run = false,
    prev_task_runs = false,
  }) {
    return api.get(`/datasets/${id}`, {
      params: {
        checksums,
        workflows,
        last_task_run,
        prev_task_runs,
      },
    });
  }

  stage_dataset(id) {
    return api.post(`/datasets/${id}/workflow/stage`);
  }

  archive_dataset(id) {
    return api.post(`/datasets/${id}/workflow/integrated`);
  }

  delete_dataset({ id, soft_delete = true }) {
    return api.delete(`/datasets/${id}`, {
      params: {
        soft_delete,
      },
    });
  }

  getStats({ type }) {
    return api.get("/datasets/stats", {
      params: {
        type,
      },
    });
  }

  is_staged(states) {
    return (
      (states || []).filter((s) => (s?.state || "").toLowerCase() == "staged")
        .length > 0
    );
  }
}

export default new DatasetService();
