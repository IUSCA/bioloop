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
}

export default new BatchService();
