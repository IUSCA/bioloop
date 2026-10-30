import api from "./api";

const DONE_STATUSES = ["REVOKED", "FAILURE", "SUCCESS"];
const FORCE_RESUME_STATUSES = ["STARTED", "PENDING"];

function parseWorkflowTimestamp(value) {
  if (typeof value !== "string" || !value.includes("T")) return NaN;

  // Rhythm serializes UTC timestamps without a timezone suffix.
  const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value}Z`;
  return Date.parse(timestamp);
}

class WorkflowService {
  getWorkflowNames() {
    return api.get("/workflows/names");
  }

  getAll({
    last_task_run = false,
    prev_task_runs = false,
    workflow_id = null,
    dataset_id = null,
    dataset_name = null,
    workflow_name = null,
    status = null,
    skip = 0,
    limit = 10,
    initiator = false,
  } = {}) {
    return api.get("/workflows", {
      params: {
        last_task_run,
        prev_task_runs,
        status,
        workflow_id: workflow_id,
        skip,
        limit,
        dataset_id,
        dataset_name,
        workflow_name,
        initiator,
      },
      paramsSerializer: {
        // to create workflow_id=123&workflow_id=456
        // instead of workflow_id[]=123&workflow_id[]=456
        indexes: null, // by default: false
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

  resume(id, { force = false } = {}) {
    return api.post(`/workflows/${id}/resume`, {}, { params: { force } });
  }

  get_force_resume_candidate(workflow, staleAfterMs, now = Date.now()) {
    if (
      !FORCE_RESUME_STATUSES.includes(workflow?.status) ||
      !Number.isFinite(staleAfterMs) ||
      staleAfterMs <= 0
    ) {
      return null;
    }

    // Match rhythm's get_pending_step(): the first step that has not succeeded.
    const step = Array.isArray(workflow.steps)
      ? workflow.steps.find((item) => item?.status !== "SUCCESS")
      : null;
    const task = step?.last_task_run;
    if (
      !FORCE_RESUME_STATUSES.includes(step?.status) ||
      typeof task?._id !== "string" ||
      !Array.isArray(task.args)
    ) {
      // Rhythm cannot restart a never-run step without explicitly supplied args.
      return null;
    }

    const updatedAt = parseWorkflowTimestamp(workflow.updated_at);
    if (!Number.isFinite(updatedAt) || !Number.isFinite(now)) return null;

    const startedAt = parseWorkflowTimestamp(task.date_start);
    const lastActivityAt = Number.isFinite(startedAt)
      ? Math.max(updatedAt, startedAt)
      : updatedAt;
    if (now - lastActivityAt < staleAfterMs) return null;

    return {
      stepName: step.name,
      taskId: task._id,
      status: step.status,
      updatedAt,
      lastActivityAt,
    };
  }

  is_workflow_done(workflow) {
    return DONE_STATUSES.includes(workflow?.status);
  }

  is_step_pending(step_name, workflows) {
    const active_wfs = (workflows || []).filter(
      (wf) => !this.is_workflow_done(wf),
    );
    const pending_steps = active_wfs
      .flatMap((wf) => wf.steps)
      .filter((step) => step.name.toLowerCase() === step_name.toLowerCase())
      .filter((step) => !DONE_STATUSES.includes(step.status));

    return pending_steps.length > 0;
  }

  get_integrated_workflow_status(workflows) {
    const ACTIVE_STATES = ["PENDING", "STARTED"];

    const integratedWorkflows = (workflows || []).filter(
      (wf) => wf.name === "integrated",
    );

    if (integratedWorkflows.length === 0) {
      return null;
    }

    const latestWorkflow = integratedWorkflows[integratedWorkflows.length - 1];

    if (!latestWorkflow.status) {
      return null;
    }

    if (ACTIVE_STATES.includes(latestWorkflow.status)) {
      return "ACTIVE";
    }

    if (latestWorkflow.status === "SUCCESS") {
      return "SUCCESS";
    }

    return "FAILURE";
  }

  getWorkflowProcesses({
    workflow_id,
    step = null,
    task_id = null,
    pid = null,
  }) {
    return api.get(`/workflows/processes`, {
      params: {
        workflow_id,
        step,
        task_id,
        pid,
      },
    });
  }

  getLogs({ processId, beforeId = null, afterId = null, level = null }) {
    return api.get(`/workflows/processes/${processId}/logs`, {
      params: {
        before_id: beforeId,
        after_id: afterId,
        level,
      },
    });
  }

  getCountsByStatus() {
    return api.get("/workflows/counts_by_status");
  }
}

export default new WorkflowService();
