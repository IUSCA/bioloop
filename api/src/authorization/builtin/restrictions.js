/**
 * The restriction layer.
 *
 *   allowed = no restriction blocks this  AND  some grant permits it
 *
 * A restriction never cancels a grant and never references one, so adding one can only
 * narrow access, and AND commutes so the order two are applied in does not matter. That
 * half of the rule is unchanged and the pipeline still runs it first.
 *
 * No restriction is specified yet, so the checker blocks nothing. Archiving and deletion are
 * not restrictions: they are states of the resource, and what each state admits is the
 * resource's own business logic, stated in `src/state/builtin/<resource>.js` and checked by
 * the service that performs the action. A refusal there is a 409, not a 403.
 *
 * A restriction, when one is specified, is something else: an external hold on a resource
 * that overrides what the caller's paths would otherwise permit, such as a legal hold or a
 * funder's embargo. It is declared by class, so each action's `mutating`, `reading`, or
 * `readingData` declaration still says which class it belongs to and this file needs no list
 * of action names.
 *
 * @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 3: the engine stops reading state
 */

/**
 * The restriction checker handed to the authorization middleware.
 *
 * Returns the name of the restriction that blocks, or null when nothing does. Kept in this
 * shape, and kept injected, so the core engine takes it as a dependency and stays free of any
 * knowledge of restrictions.
 *
 * @returns {Promise<string|null>}
 */
// The engine calls this with its own signature and awaits the result, so it stays an async
// function of that shape rather than a constant.
// eslint-disable-next-line lodash-fp/prefer-constant
async function checkRestriction() {
  return null;
}

module.exports = { checkRestriction };
