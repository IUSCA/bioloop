const axios = require('axios');
const config = require('config');

const logger = require('./logger');

const wfApi = axios.create({
  baseURL: config.get('workflow_server.base_url'),
  headers: { Authorization: `Bearer ${config.get('workflow_server.auth_token')}` },
});

function getAll({
  last_task_run = false,
  prev_task_runs = false,
  only_active = false,
  app_id = null,
  skip = null,
  limit = null,
} = {}) {
  return wfApi.get('/workflows', {
    params: {
      last_task_run,
      prev_task_runs,
      only_active,
      app_id,
      skip,
      limit,
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

function includeWorkflows(lastTaskRun, prevTaskRuns) {
  /**
   * Returns a functions that populates workflows in dataset using ids in dataset.workflows
   * dataset.workflows: [{id: ''}]
   */
  return function anon(dataset) {
    /**
     * returns a promise that yields a modified dataset with workflows populated
     */
    const futureWorkflows = dataset.workflows.map(
      ({ id }) => getOne(id, lastTaskRun, prevTaskRuns)
        .then((res) => res.data)
        .catch((err) => {
          logger.error(`error fetching workflow ${id}`, err);
        }),
    );
    // wait for all API calls to be done
    // filter out null values caused by failed fetches
    return Promise.all(futureWorkflows)
      .then((workflows) => workflows.filter((x) => x))
      .then((workflows) => {
        // eslint-disable-next-line no-param-reassign
        dataset.workflows = workflows;
        return dataset;
      });
  };
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

module.exports = {
  getAll,
  getOne,
  // includeWorkflow,
  pause,
  deleteOne,
  resume,
  create,
  includeWorkflows,
};
