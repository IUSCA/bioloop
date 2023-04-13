import api from "./api";

class BatchService {
  getAll(checksums = false, workflows = true) {
    return api
      .get("/batches", {
        params: {
          checksums,
          workflows,
        },
      })
      .then((response) => response.data);
  }

  getById(
    id,
    checksums = false,
    workflows = true,
    last_task_run = false,
    prev_task_runs = false
  ) {
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
    return api.post(`/batches/${batch_id}/stage`);
  }

  delete_batch(batch_id) {
    return api.delete(`/batches/${batch_id}`);
  }
}

export default new BatchService();
