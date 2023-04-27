import api from "./api";

class BatchService {
  getAll({ deleted = null, processed = null, type = null } = {}) {
    return api.get("/batches", {
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
    return api.get(`/batches/${id}`, {
      params: {
        checksums,
        workflows,
        last_task_run,
        prev_task_runs,
      },
    });
  }

  stage_batch(batch_id) {
    return api.post(`/batches/${batch_id}/workflow/stage`);
  }

  archive_batch(batch_id) {
    return api.post(`/batches/${batch_id}/workflow/integrated`);
  }

  delete_batch({ batch_id, soft_delete = true }) {
    return api.delete(`/batches/${batch_id}`, {
      params: {
        soft_delete,
      },
    });
  }

  getStats({ type }) {
    return api.get("/batches/stats", {
      params: {
        type,
      },
    });
  }

  is_staged(dataset) {
    const steps = dataset?.steps || [];
    return (
      steps.filter((s) => (s?.name || "").toLowerCase() == "staged").length > 0
    );
  }
}

export default new BatchService();
