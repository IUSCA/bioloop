import api from "./api";

const DONE_STATUSES = ["REVOKED", "FAILURE", "SUCCESS"];

class WorkflowService {
  getAll({
    last_task_run = false,
    prev_task_runs = false,
    only_active = false,
  } = {}) {
    return api.get("/workflows", {
      params: {
        last_task_run,
        prev_task_runs,
        only_active,
      },
    });
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
    return DONE_STATUSES.includes(workflow?.status);
  }

  is_step_pending(step_name, workflows) {
    const active_wfs = workflows.filter((wf) => !this.is_workflow_done(wf));
    const pending_steps = active_wfs
      .flatMap((wf) => wf.steps)
      .filter((step) => step.name.toLowerCase() === step_name.toLowerCase())
      .filter((step) => !DONE_STATUSES.includes(step.status));

    return pending_steps.length > 0;
  }
}

export default new WorkflowService();
