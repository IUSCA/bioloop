const axios = require('axios');
const config = require('config');

const wfApi = axios.create({
  baseURL: config.get('workflow_server.base_url'),
  headers: { Authorization: `Bearer ${config.get('workflow_server.auth_token')}` },
});

function getAll({
  last_task_run = false,
  prev_task_runs = false,
  status = null,
  app_id = null,
  skip = null,
  limit = null,
  workflow_ids = null,
  workflow_name = null,
} = {}) {
  return wfApi.get('/workflows', {
    params: {
      last_task_run,
      prev_task_runs,
      status,
      app_id,
      skip,
      limit,
      workflow_id: workflow_ids,
      workflow_name,
    },
    paramsSerializer: {
      // to create workflow_id=123&workflow_id=456
      // instead of workflow_id[]=123&workflow_id[]=456
      indexes: null, // by default: false
    },
  });
}

function getOne(id, last_task_run = false, prev_task_runs = false) {
  return wfApi.get(`/workflows/${id}`, {
    params: {
      last_task_run,
      prev_task_runs,
    },
  });
}

function pause(id) {
  return wfApi.post(`/workflows/${id}/pause`, {});
}

function deleteOne(id) {
  return wfApi.delete(`/workflows/${id}`);
}

function resume(id) {
  return wfApi.post(`/workflows/${id}/resume`, {});
}

function create(wf) {
  return wfApi.post('/workflows', wf);
}

function getCountsByStatus({ app_id }) {
  return wfApi.get('/workflows/counts_by_status', {
    params: {
      app_id,
    },
  });
}

module.exports = {
  getAll,
  getOne,
  // includeWorkflow,
  pause,
  deleteOne,
  resume,
  create,
  getCountsByStatus,
};
