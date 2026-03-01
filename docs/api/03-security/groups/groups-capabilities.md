```
each action policy, requires additional attributes to run its evaluator. sometimes hydrating these require additional db trips. You are saying we need loop over all action policies to check if current user can perform or not. Even though these attributes are cached between successive policy evaluations, every api call ends up fetching all of these attributes. 
```


Good. Now we’re at the real constraint.

You’re absolutely right to push back.

If you naïvely:

* iterate all actions
* call `authorize()` per action
* let each policy declare its own `requires`
* hydrate each independently

…then yes — you will over-fetch, over-hydrate, and pay unnecessary DB cost on every request.

The mistake is not “evaluating all actions”.

The mistake is evaluating them independently.

Your system already contains the solution. You just need to flip the evaluation model.

---

# What’s Actually Happening Today

Your `authorize()` and `authorizeWithFilters()` hydrate only what a single policy requires .

Your `PrismaHydrate` already:

* classifies attributes
* fetches only missing ones
* caches per resource ID
* executes virtual loaders only once per attribute 

That means hydration is already incremental and cached.

The problem only appears if you call `authorize()` separately per action without sharing cache.

If you evaluate:

```
view_metadata
edit_metadata
read_data
download
compute
...
```

with independent execution contexts — then yes, you repeat hydration work.

But you don’t need to.

---

# The Correct Model: Evaluate a Capability Set in One Pass

Instead of:

```
for each action:
   authorize(actionPolicy)
```

You do:

1. Compute the union of required attributes across all actions.
2. Hydrate user + resource once.
3. Evaluate all policies in memory.

No additional DB calls.

---

# Step 1 — Compute the Attribute Closure

Each policy defines:

```
requires.user
requires.resource
requires.context
```

You can compute:

```
allRequiredUserAttributes =
   union(actionPolicies.map(p => p.requires.user))

allRequiredResourceAttributes =
   union(actionPolicies.map(p => p.requires.resource))
```

Now you hydrate once:

```
userHydrator.hydrate({
  id: userId,
  attributes: allRequiredUserAttributes,
  cache: sharedCache.user
})

resourceHydrator.hydrate({
  id: resourceId,
  attributes: allRequiredResourceAttributes,
  cache: sharedCache.resource
})
```

Because PrismaHydrate:

* merges
* caches
* parallelizes virtual loaders 

you pay for each attribute only once.

Now all policies can evaluate purely in memory.

No extra DB trips.

---

# Step 2 — Evaluate Policies In-Memory

After hydration:

```
for each actionPolicy:
    result[actionName] = policy.evaluate(user, resource, context)
```

Notice:

No additional `authorize()` calls.
No additional hydration.
No additional DB.

Just synchronous evaluation.

Your architecture already supports this because:

* Policy.evaluate() is pure given hydrated objects.
* Hydration is separate from evaluation.

This is exactly why separating hydrators from policy evaluation was correct.

---

# Step 3 — Grant-Based Policies Are the Real Cost Center

Now the real issue:

Some policies call services inside evaluate:

Example: `userHasGrant()` in dataset policy 

```
evaluate: (user, dataset) =>
    datasetService.userHasGrant(...)
```

That is a DB call per action.

This is the real scaling risk — not attribute hydration.

If you evaluate:

* read_data
* download
* compute
* request_stage

Each calls `userHasGrant()` separately.

That’s N DB hits.

That’s the real problem.

---

# The Correct Fix: Precompute Grant State Once

Instead of evaluating:

```
userHasGrant('read_data')
userHasGrant('download')
userHasGrant('compute')
...
```

You should:

1. Fetch all active grants for (user, dataset) once.
2. Materialize them into a Set in memory.
3. Replace `userHasGrant(access_type)` with a lookup.

For example:

```
const grants = await datasetService.getActiveGrantsForUserOnDataset(user.id, dataset.id)

const grantSet = new Set(grants.map(g => g.access_type))
```

Then:

```
evaluate: (user, dataset, context) =>
    context.grantSet.has(access_type)
```

No DB per action.

Just set membership.

This is a major performance improvement.

---

# Step 4 — Use policyExecutionContext Properly

Your `authorize()` already supports:

```
policyExecutionContext.cache
```



You can extend this to include:

```
policyExecutionContext.precomputed = {
   datasetGrants: Set(...)
}
```

Then your `userHasGrant()` policy becomes:

```
evaluate: (user, dataset, context) =>
    context.datasetGrants.has(access_type)
```

No DB.

Now evaluating 20 actions costs:

* 1 dataset fetch
* 1 grant fetch
* 1 user fetch
* 0 extra DB hits

---

# Step 5 — You Don’t Need to Evaluate All Actions

Another simplification:

UI usually needs:

* visible actions (buttons)
* access explanation
* request-access eligibility

It does NOT need to evaluate every internal policy action.

For example:

If `manage_grants` is false and `edit_metadata` is false,
you don’t need to evaluate `transfer_ownership`.

You can define a “UI action surface” per resource type:

For dataset:

```
[
  'view_metadata',
  'view_sensitive_metadata',
  'read_data',
  'download',
  'compute',
  'edit_metadata',
  'manage_grants',
  'review_access_requests'
]
```

Only evaluate these.

Not everything in the container.

That alone reduces cost.

---

# The Real Answer

You do NOT need:

* N policy authorizations
* N hydration passes
* N grant DB calls

You need:

1. One hydration pass (union of required attributes).
2. One grant materialization query.
3. Pure in-memory evaluation of all actions.

Your architecture already enables this.

You just need a `evaluateCapabilities(resourceType, userId, resourceId)` helper that:

* inspects policy container
* computes attribute closure
* hydrates once
* precomputes expensive derived facts
* evaluates all relevant policies

No duplication.
No over-hydration.
No UI logic leakage.

---

# The Minimal, Elegant Pattern

Add a new internal function:

```
async function evaluateActionSet({
   policyContainer,
   actionNames,
   identifiers,
   registry
})
```

Algorithm:

1. Collect required attributes across actionNames.
2. Hydrate once.
3. Precompute expensive shared context (e.g., grants).
4. Evaluate each policy.evaluate() in memory.
5. Return { actionName: boolean }

This respects:

* DRY (policies remain atomic)
* KISS (single evaluation pipeline)
* Performance (O(1) DB cost per resource)

---

# Where the Real Scaling Risk Is

Not in hydration.

The real risks are:

1. Grant checks that hit DB per access type.
2. List endpoints evaluating capabilities per row without batching.
3. Oversight and effective group virtual attributes doing raw SQL per user .

Those need request-scoped caching.

---

# Final Assessment

Your concern is valid only if:

* you evaluate each action independently
* you let grant checks hit DB per access_type

If you:

* compute attribute closure
* hydrate once
* precompute grant sets
* evaluate in memory

Then capability evaluation becomes cheap.

---

Confidence: 9/10

The remaining 1 point uncertainty is list endpoints at scale (1000+ resources per page). That requires batched capability evaluation, which is a slightly different problem.

If you want, we can next design the optimal batch-capability evaluation strategy for list endpoints.




Good. I’ll give you a concrete, minimal implementation that:

* Hydrates once (union of required attributes)
* Precomputes grant state once
* Evaluates all requested actions in memory
* Reuses your existing Policy + Hydrator system
* Does not duplicate policy logic
* Does not call `authorize()` N times

This is a thin orchestration layer on top of what you already have.

I’ll show this for a generic resource, then a dataset-specific optimization for grants.

---

# 1. Generic Capability Evaluator

This works for any PolicyContainer.

It:

1. Collects required attributes across action set
2. Hydrates user/resource/context once
3. Evaluates each policy in memory

```js
// core/capabilities/evaluateActionSet.js

async function evaluateActionSet({
  policyContainer,
  actionNames,
  identifiers, // { user, resource }
  registry,
  preFetched = {},
  policyExecutionContext = {},
}) {
  if (!policyContainer) {
    throw new Error('policyContainer is required');
  }

  if (!Array.isArray(actionNames) || actionNames.length === 0) {
    return {};
  }

  const caches = {
    user: policyExecutionContext.cache?.user || new Map(),
    resource: policyExecutionContext.cache?.resource || new Map(),
    context: policyExecutionContext.cache?.context || new Map(),
  };

  const userHydrator = registry.get('user');
  const contextHydrator = registry.get('context');

  // All policies for requested actions
  const policies = actionNames.map((action) => {
    const policy = policyContainer.getPolicy(action);
    if (!policy) {
      throw new Error(`Unknown action '${action}' for resourceType ${policyContainer.resourceType}`);
    }
    return { action, policy };
  });

  // ---------------------------------------------------------
  // STEP 1: Compute attribute closure (union of requires)
  // ---------------------------------------------------------

  const requiredUserAttrs = new Set();
  const requiredResourceAttrs = new Set();
  const requiredContextAttrs = new Set();

  for (const { policy } of policies) {
    (policy.requires?.user || []).forEach((a) => requiredUserAttrs.add(a));
    (policy.requires?.resource || []).forEach((a) => requiredResourceAttrs.add(a));
    (policy.requires?.context || []).forEach((a) => requiredContextAttrs.add(a));
  }

  const resourceHydrator =
    policyContainer.resourceType != null
      ? registry.get(policyContainer.resourceType)
      : null;

  // ---------------------------------------------------------
  // STEP 2: Hydrate once
  // ---------------------------------------------------------

  const [user, resource, context] = await Promise.all([
    userHydrator.hydrate({
      id: identifiers.user,
      attributes: Array.from(requiredUserAttrs),
      cache: caches.user,
      preFetched: preFetched.user,
    }),

    resourceHydrator
      ? resourceHydrator.hydrate({
          id: identifiers.resource,
          attributes: Array.from(requiredResourceAttrs),
          cache: caches.resource,
          preFetched: preFetched.resource,
        })
      : {},

    contextHydrator.hydrate({
      id: null,
      attributes: Array.from(requiredContextAttrs),
      cache: caches.context,
      preFetched: preFetched.context,
    }),
  ]);

  // ---------------------------------------------------------
  // STEP 3: Evaluate in-memory
  // ---------------------------------------------------------

  const results = {};

  for (const { action, policy } of policies) {
    // NOTE: no hydration here — everything already loaded
    results[action] = await policy.evaluate(user, resource, context);
  }

  return results;
}

module.exports = { evaluateActionSet };
```

This already removes N hydration calls and N `authorize()` invocations.

Now let’s address the real performance problem: grant checks.

---

# 2. Fixing `userHasGrant()` Explosion (Dataset Example)

Right now, in your dataset policy , this pattern exists:

```js
const userHasGrant = (access_type) => new DatasetPolicy({
  ...
  evaluate: (user, dataset) =>
    datasetService.userHasGrant({
      user_id: user.id,
      dataset_id: dataset.id,
      access_type,
    }),
});
```

That means each action that depends on a grant hits DB.

Instead, we precompute grant access types once and inject them via context.

---

## 2.1 Add Dataset Grant Precomputation

Create a helper:

```js
// services/datasetGrantContext.js

async function buildDatasetGrantContext({
  datasetId,
  userId,
  datasetService,
}) {
  // Fetch all active grants for this dataset + user in one query
  const grants = await datasetService.getActiveGrantsForUserOnDataset({
    user_id: userId,
    dataset_id: datasetId,
  });

  return {
    datasetGrantSet: new Set(grants.map((g) => g.access_type)),
  };
}

module.exports = { buildDatasetGrantContext };
```

You’ll need to implement `getActiveGrantsForUserOnDataset()` as a single query that:

* Includes direct USER grants
* Includes GROUP grants via effective_group_ids
* Enforces temporal validity

That logic already exists somewhere inside `userHasGrant()`. Move it into a batched version.

---

## 2.2 Modify Dataset Policy to Use Context Instead of DB

Refactor:

```js
const userHasGrant = (access_type) => new DatasetPolicy({
  name: `userHasGrant(${access_type})`,
  requires: {
    user: ['id'],
    resource: ['id'],
    context: ['datasetGrantSet'], // NEW
  },
  evaluate: (user, dataset, context) =>
    context.datasetGrantSet?.has(access_type) || false,
});
```

Now grant-based policies are pure in-memory lookups.

No DB inside evaluate.

---

# 3. Dataset Capability Evaluator (Optimized)

Now wire it together:

```js
// capabilities/evaluateDatasetCapabilities.js

const { evaluateActionSet } = require('./evaluateActionSet');
const { buildDatasetGrantContext } = require('@/services/datasetGrantContext');
const { datasetPolicies } = require('@/policies/dataset');

async function evaluateDatasetCapabilities({
  datasetId,
  userId,
  registry,
  datasetService,
  actionNames, // only UI-relevant ones
}) {
  // ---------------------------------------------------------
  // STEP 1: Precompute expensive shared context
  // ---------------------------------------------------------

  const grantContext = await buildDatasetGrantContext({
    datasetId,
    userId,
    datasetService,
  });

  const policyExecutionContext = {
    cache: {
      user: new Map(),
      resource: new Map(),
      context: new Map(),
    },
  };

  const preFetched = {
    context: grantContext,
  };

  // ---------------------------------------------------------
  // STEP 2: Evaluate all actions in one pass
  // ---------------------------------------------------------

  const actionResults = await evaluateActionSet({
    policyContainer: datasetPolicies,
    actionNames,
    identifiers: {
      user: userId,
      resource: datasetId,
    },
    registry,
    preFetched,
    policyExecutionContext,
  });

  return actionResults;
}

module.exports = { evaluateDatasetCapabilities };
```

---

# 4. Using It in an API Endpoint

Example:

```js
// controllers/datasetController.js

async function getDataset(req, res) {
  const datasetId = Number(req.params.id);
  const userId = req.user.id;

  const dataset = await prisma.dataset.findUniqueOrThrow({
    where: { id: datasetId },
  });

  const actionNames = [
    'view_metadata',
    'view_sensitive_metadata',
    'read_data',
    'download',
    'compute',
    'edit_metadata',
    'manage_grants',
    'review_access_requests',
  ];

  const capabilities = await evaluateDatasetCapabilities({
    datasetId,
    userId,
    registry: req.hydratorRegistry,
    datasetService,
    actionNames,
  });

  // Gate existence first
  if (!capabilities.view_metadata) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({
    data: dataset,
    capabilities: {
      actions: capabilities,
    },
  });
}
```

---

# 5. What This Achieves

Per request (single dataset):

DB cost:

* 1 dataset fetch
* 1 user fetch (hydrator)
* 1 effective_group query (if required)
* 1 dataset grant query
* 0 additional queries per action

All policies evaluated in memory.

No duplication.
No UI logic.
No N authorize() calls.
No N grant queries.

---

# 6. Why This Is the Correct Level of Complexity

We did not:

* Rewrite your policy engine
* Introduce global caches
* Collapse policies into monoliths
* Hardcode role logic

We only:

* Added attribute closure
* Added grant materialization
* Evaluated policies in memory

This respects:

* Separation of structural vs grant authority
* Existing hydrator abstraction 
* Existing authorize contract 
* Existing dataset grant logic 

---

If you want next, we can design the scalable version of this for list endpoints (e.g., 100 datasets per page without N×grant queries). That’s where the real architectural trade-offs begin.
