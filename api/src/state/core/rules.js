/**
 * A state rule: whether a resource's own state admits one action.
 *
 * A rule is a pure function of the resource. It never queries, because the caller has already
 * fetched the row — a service inside its transaction, a list once for its page. `requires` names
 * the fields the rule reads, so a caller that fetched too little is told which field is missing
 * instead of being answered from an undefined value.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

/** Why a state refuses an action. Services turn one into a 409. */
class StateRefusal {
  constructor(message, { state = null } = {}) {
    this.message = message;
    this.state = state;
  }
}

/**
 * A refusal, with the message the caller shows.
 * @param {string} message
 * @param {Object} [options]
 * @param {string} [options.state] - the state that refused, for a caller that wants to branch
 * @returns {StateRefusal}
 */
function refuse(message, options = {}) {
  return new StateRefusal(message, options);
}

/**
 * Declares the rule for one action.
 * @param {Object} declaration
 * @param {string[]} [declaration.requires] - field paths on the resource, such as `owner_group.is_archived`
 * @param {function(Object): (StateRefusal|null)} declaration.check
 */
function rule({ requires = [], check }) {
  if (!Array.isArray(requires) || requires.some((field) => typeof field !== 'string')) {
    throw new Error('A state rule: requires must be an array of field paths');
  }
  if (typeof check !== 'function') {
    throw new Error('A state rule: check must be a function');
  }
  return Object.freeze({ requires: Object.freeze([...requires]), check });
}

/** An action no state limits. Declared rather than assumed, so a missing rule stays an error. */
const always = rule({ requires: [], check: () => null });

module.exports = {
  StateRefusal, refuse, rule, always,
};
