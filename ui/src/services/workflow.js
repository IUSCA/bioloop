import api from "./api";

class WorkflowService {
  getAll(last_task_run = false, prev_task_runs = false) {
    return api
      .get("/workflows", {
        params: {
          last_task_run,
          prev_task_runs,
        },
      })
      .then((response) => response.data);
  }

  getById(id, last_task_run = false, prev_task_runs = false) {
    return api.get(`/workflows/${id}`, {
      params: {
        last_task_run,
        prev_task_runs,
      },
    });
  }

  pause(id) {
    return api.post(`/workflows/${id}/pause`);
  }

  delete(id) {
    return api.delete(`/workflows/${id}`);
  }

  resume(id) {
    return api.post(`/workflows/${id}/resume`);
  }
}

export default new WorkflowService();
