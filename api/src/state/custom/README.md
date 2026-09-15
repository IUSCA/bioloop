# Custom state containers

A derived app declares what its own resources' states admit here, one file per resource type, and
registers each container in section 2 of `src/state/index.js`. Nothing in `core/` or `builtin/` is
edited.

A container is built the way the builtin ones are:

```js
const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

const shipmentState = new StateContainer({ resourceType: 'shipment' }).rules({
  cancel: rule({
    requires: ['status'],
    check: (shipment) => (shipment.status === 'PENDING'
      ? null
      : refuse(`This shipment is ${shipment.status.toLowerCase()}, and only a pending one can be cancelled.`)),
  }),
  view_metadata: always,
});

module.exports = { shipmentState };
```

Three things to know before adding one.

**Every action of the matching policy container needs a rule.** The startup check throws when one
has none, and an action no state limits declares `always` rather than being left out. A rule naming
an action the policy container does not declare throws too, so a rename cannot leave a stale rule
behind. A resource with no policy container at all — an invitation is the builtin example — passes
`standalone: true`, and then its action names are its own.

**A rule is a pure function of the row it is given.** It runs no query and takes no transaction. The
caller fetches the fields, so `requires` must name every field path the rule reads, such as
`owner_group.is_archived`. A caller that fetched too little gets an error naming the field rather
than an answer computed from `undefined`.

**The caller fetches inside its own transaction.** A service reads the row after taking its row
lock and calls `assertPossible`, which throws a 409. A list fetches the fields once for its page and
calls `availableActions` per row. `requiredFields(resourceType)` gives a caller the union to select.

@see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
