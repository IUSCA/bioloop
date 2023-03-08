const axios = require('axios');
const config = require('config');

const logger = require('./logger');

const wfApi = axios.create({
  baseURL: config.get('workflow_server.base_url'),
});

function getAll(lastTaskRun = false, prevTaskRuns = false) {
  return wfApi.get('/workflow', {
    params: {
      last_task_run: lastTaskRun,
      prev_task_runs: prevTaskRuns,
    },
  });
}

function getOne(id, lastTaskRun = false, prevTaskRuns = false) {
  return wfApi.get(`/workflow/${id}`, {
    params: {
      last_task_run: lastTaskRun,
      prev_task_runs: prevTaskRuns,
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

module.exports = {
  getAll,
  getOne,
  includeWorkflow,
};
