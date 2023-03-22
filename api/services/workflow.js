const axios = require('axios');
const config = require('config');

const logger = require('./logger');

const wfApi = axios.create({
  baseURL: config.get('workflow_server.base_url'),
});

function getAll(last_task_run = false, prev_task_runs = false) {
  return wfApi.get('/workflow', {
    params: {
      last_task_run,
      prev_task_runs,
    },
  });
}

function getOne(id, last_task_run = false, prev_task_runs = false) {
  return wfApi.get(`/workflow/${id}`, {
    params: {
      last_task_run,
      prev_task_runs,
    },
  });
}

function includeWorkflow(lastTaskRun = false, prevTaskRuns = false) {
  return async function anon(batch) {
    if (batch.workflow_id) {
      try {
        const res = await getOne(batch.workflow_id, lastTaskRun, prevTaskRuns);
        // eslint-disable-next-line no-param-reassign
        batch.workflow = res.data;
      } catch (error) {
        logger.error(error);
      }
    }
    return batch;
  };
}

function pause(id) {
  return wfApi.post(`/workflow/${id}/pause`, {});
}

function deleteOne(id) {
  return wfApi.delete(`/workflow/${id}`);
}

function resume(id) {
  return wfApi.post(`/workflow/${id}/resume`, {});
}

module.exports = {
  getAll,
  getOne,
  includeWorkflow,
  pause,
  deleteOne,
  resume,
};
