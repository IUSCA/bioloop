import { computed, unref } from "vue";

/**
 * The two answers a v2 response carries about one resource, as one helper.
 *
 * `_meta.capabilities` says what the caller could do, and `_meta.available_actions` says what
 * the resource's own state admits. A control needs both: the caller's authority decides whether
 * it appears at all, and the resource's state decides whether it can be used right now.
 *
 * So `can` gates existence and `enabled` gates use. An archived group's admin keeps
 * `edit_metadata` as a capability, which is why the Edit control still shows, and the group's
 * state leaves the action out, which is why it shows disabled rather than vanishing. An action
 * the state can never readmit is hidden with `available` instead.
 *
 * **A response with no `available_actions` key means the route does not say, not that the
 * resource admits nothing.** Several list routes do not serve it yet. Reading a missing key as
 * "nothing is admitted" would disable every control on those lists, so `enabled` falls back to
 * `can` there. The risk that buys is real and worth naming: a route that should serve the key
 * and does not leaves its controls quietly enabled, and the service's own 409 is then the only
 * thing standing in the way. `api/tests/routes/stateRefusals.test.js` asserts the routes that
 * matter do serve it.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 5: the UI
 *
 * @param {object|import('vue').Ref} source - the resource, or a ref to it, as the API sent it
 * @returns {{
 *   capabilities: import('vue').ComputedRef<Set<string>>,
 *   availableActions: import('vue').ComputedRef<Set<string>|null>,
 *   can: (action: string) => boolean,
 *   available: (action: string) => boolean,
 *   enabled: (action: string) => boolean,
 * }}
 */
export function useCapabilities(source) {
  const meta = computed(() => unref(source)?._meta ?? null);

  const capabilities = computed(() => new Set(meta.value?.capabilities ?? []));

  // null, not an empty set, so a route that does not answer is distinguishable from a state
  // that admits nothing.
  const availableActions = computed(() =>
    meta.value?.available_actions
      ? new Set(meta.value.available_actions)
      : null,
  );

  /** Whether the caller holds the action, whatever the resource's state. */
  const can = (action) => capabilities.value.has(action);

  /** Whether the resource's state admits the action. False when the route does not answer. */
  const available = (action) => availableActions.value?.has(action) ?? false;

  /** Whether the control should work: the caller holds it and the state admits it. */
  const enabled = (action) =>
    can(action) && (availableActions.value?.has(action) ?? true);

  return { capabilities, availableActions, can, available, enabled };
}

/**
 * Whether one row's state admits the action.
 *
 * The same answer `available` gives, for a list row. A table builds a control per row, and a
 * composable per row would be noise, so these two read the row directly.
 *
 * Strict, like `available`: a row with no `available_actions` admits nothing. Hiding a control
 * is the safe direction to fail in, because the service refuses the action anyway and the
 * caller sees a 409 rather than a control that silently does nothing.
 *
 * @param {object} resource - a row as the API sent it
 * @param {string} action
 * @returns {boolean}
 */
export function admits(resource, action) {
  return (resource?._meta?.available_actions ?? []).includes(action);
}

/**
 * Whether the caller holds the action on one row, whatever the row's state.
 * @param {object} resource - a row as the API sent it
 * @param {string} action
 * @returns {boolean}
 */
export function holds(resource, action) {
  return (resource?._meta?.capabilities ?? []).includes(action);
}

export default useCapabilities;
