const axios = require('axios');
const config = require('config');

const logger = require('./logger');

const wfApi = axios.create({
  baseURL: config.get('workflow_server.base_url'),
});

function getAll(last_task_run = false, prev_task_runs = false, progress = false) {
  return wfApi.get('/workflow', {
    params: {
      last_task_run,
      prev_task_runs,
      progress,
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

// function includeWorkflow(lastTaskRun = false, prevTaskRuns = false) {
//   return async function anon(batch) {
//     if (batch.workflow_id) {
//       try {
//         const res = await getOne(batch.workflow_id, lastTaskRun, prevTaskRuns);
//         // eslint-disable-next-line no-param-reassign
//         batch.workflow = res.data;
//       } catch (error) {
//         logger.error(error);
//       }
//     }
//     return batch;
//   };
// }

function includeWorkflows(lastTaskRun, prevTaskRuns) {
  /**
   * Returns a functions that populates workflows in batch using ids in batch.workflows
   * batch.workflows: [{id: ''}]
   */
  return function anon(batch) {
    /**
     * returns a promise that yields a modified batch with workflows populated
     */
    const futureWorkflows = batch.workflows.map(
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
        batch.workflows = workflows;
        return batch;
      });
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

function create(wf) {
  return wfApi.post('/workflow', wf);
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
