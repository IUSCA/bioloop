import api from "./api";

class WorkflowService {
  getAll(last_task_run = false, prev_task_runs = false) {
    return api
      .get("/wokflows", {
        params: {
          last_task_run,
          prev_task_runs,
        },
      })
      .then((response) => response.data);
  }

  getById(id, last_task_runs = false, prev_task_runs = false) {
    return api.get(`/workflows/${id}`, {
      params: {
        last_task_runs,
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

  is_workflow_done(workflow) {
    return ["REVOKED", "FAILURE", "SUCCESS"].includes(workflow?.status);
  }
}

export default new WorkflowService();
