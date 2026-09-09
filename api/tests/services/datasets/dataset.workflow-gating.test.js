/**
 * dataset.workflow-gating.test.js
 *
 * Which workflows a user may launch, and which policy action gates each, is configuration
 * rather than a branch in the route. These tests pin the contract and guard against the two
 * config blocks drifting apart.
 *
 * @see .todo/issues/06-dataset-actions-workflows.md — Phase 3
 */

const path = require('path');
const config = require('config');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const workflowService = require('@/services/datasets_v2/workflows');
const { datasetPolicies } = require('@/authorization/builtin/policies/dataset');

describe('which workflows can be launched', () => {
  test('the set a caller may launch comes from config, not from a hardcoded list', () => {
    expect(workflowService.runnableWorkflows().sort()).toEqual(['integrated', 'stage']);
  });

  test('delete is registered but not one a caller may launch', () => {
    // It runs as a consequence of archiving an archived dataset, never on request.
    expect(config.workflow_registry.has('delete')).toBe(true);
    expect(workflowService.runnableWorkflows()).not.toContain('delete');
    expect(workflowService.policyActionFor('delete')).toBeNull();
  });

  test('an unregistered workflow is refused rather than defaulted', () => {
    // The route turns null into a 400 naming the workflow. Before this, anything that was
    // not "stage" silently fell through to the compute policy.
    expect(workflowService.policyActionFor('exfiltrate')).toBeNull();
    expect(workflowService.policyActionFor(undefined)).toBeNull();
  });

  test('a workflow inherits nothing from Object.prototype', () => {
    // hasOwnProperty rather than a truthiness check, so 'constructor' is not a workflow.
    expect(workflowService.policyActionFor('constructor')).toBeNull();
    expect(workflowService.policyActionFor('toString')).toBeNull();
  });
});

describe('each workflow a caller may launch maps to a real action', () => {
  test('staging needs request_stage and computing needs compute', () => {
    expect(workflowService.policyActionFor('stage')).toBe('request_stage');
    expect(workflowService.policyActionFor('integrated')).toBe('compute');
  });

  test('every configured action exists on the dataset policy container', () => {
    // The guard against the two config blocks drifting. A typo here would otherwise surface
    // as an authorization failure at runtime rather than as a failing test.
    for (const name of workflowService.runnableWorkflows()) {
      const action = workflowService.policyActionFor(name);
      expect(datasetPolicies.hasAction(action)).toBe(true);
    }
  });

  test('every configured workflow is registered', () => {
    const configured = Object.keys(config.get('workflow_policy_actions'));
    for (const name of configured) {
      expect(config.workflow_registry.has(name)).toBe(true);
    }
    // runnableWorkflows filters to registered ones, so an unregistered entry would be
    // silently dropped rather than reported. Assert the two agree.
    expect(workflowService.runnableWorkflows().sort()).toEqual(configured.sort());
  });

  test('the policy action map does not leak into the workflow service payload', () => {
    // The legacy dataset service builds its payload by spreading a registry entry, which is
    // why this map lives beside the registry rather than inside it.
    for (const name of workflowService.runnableWorkflows()) {
      expect(config.workflow_registry[name]).not.toHaveProperty('action');
    }
  });
});

describe('staging several datasets at once', () => {
  const dataset = (n, is_staged = false) => ({
    id: n, resource_id: `r${n}`, name: `ds${n}`, is_staged,
  });

  const startRun = () => Promise.resolve({ workflow_id: 'wf' });

  test('a dataset the caller cannot stage does not stop the others', async () => {
    // The reason partial results exist: a collection groups datasets owned by different
    // groups, so refusing the batch would make "stage all" useless to anyone holding
    // access to part of it.
    const started = [];
    const result = await workflowService.bulkStage([dataset(1), dataset(2), dataset(3)], {
      permits: async (rid) => rid !== 'r2',
      startRun: (d) => { started.push(d.resource_id); return startRun(); },
    });

    expect(result.staged.map((d) => d.resource_id)).toEqual(['r1', 'r3']);
    expect(result.denied.map((d) => d.resource_id)).toEqual(['r2']);
    expect(result.skipped).toEqual([]);
    // A refused dataset never reaches the workflow service.
    expect(started).toEqual(['r1', 'r3']);
  });

  test('an already staged dataset is skipped, not restaged', async () => {
    const started = [];
    const result = await workflowService.bulkStage([dataset(1, true), dataset(2)], {
      permits: async () => true,
      startRun: (d) => { started.push(d.resource_id); return startRun(); },
    });

    expect(result.skipped).toEqual([
      { resource_id: 'r1', name: 'ds1', reason: 'already staged' },
    ]);
    expect(result.staged.map((d) => d.resource_id)).toEqual(['r2']);
    expect(started).toEqual(['r2']);
  });

  test('a dataset already being staged is skipped with the reason', async () => {
    // createWorkflow asserts when a run of the same name is pending. One dataset in that
    // state is not a reason to abandon the rest of the batch.
    const result = await workflowService.bulkStage([dataset(1), dataset(2)], {
      permits: async () => true,
      startRun: (d) => (d.resource_id === 'r1'
        ? Promise.reject(new Error('A workflow with the same name is either pending / running'))
        : startRun()),
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/pending \/ running/);
    expect(result.staged.map((d) => d.resource_id)).toEqual(['r2']);
  });

  test('every dataset lands in exactly one bucket', async () => {
    const input = [dataset(1), dataset(2, true), dataset(3)];

    const result = await workflowService.bulkStage(input, {
      permits: async (rid) => rid !== 'r3',
      startRun,
    });

    const seen = [...result.staged, ...result.denied, ...result.skipped]
      .map((d) => d.resource_id).sort();
    expect(seen).toEqual(['r1', 'r2', 'r3']);
  });

  test('the batch cap is a stated limit, not an accident', () => {
    // Matches the cap on POST /v2/datasets/bulk. Each dataset costs a workflow-service call
    // and a staging job.
    expect(workflowService.MAX_BULK_STAGE).toBe(100);
  });
});
