/**
 * One resource type's state rules.
 *
 * Which actions a state admits is business logic, so it lives in the resource's own file under
 * `state/builtin/` and this class only holds it. The shape mirrors `PolicyContainer`, so a reader
 * of one recognises the other.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */
class StateContainer {
  /**
   * @param {Object} params
   * @param {string} params.resourceType
   * @param {boolean} [params.standalone] - true for a resource with no policy container, such as
   *   an invitation. The startup check then allows its actions to name no policy action.
   * @param {string} [params.description]
   */
  constructor({ resourceType, standalone = false, description = '' }) {
    if (!resourceType || typeof resourceType !== 'string') {
      throw new Error('A state container needs a resourceType');
    }
    this.meta = Object.freeze({ resourceType, standalone, description });
    this._rules = {};
    this._frozen = false;
  }

  /**
   * Declares every action's rule, and freezes the container.
   * @param {Object<string, {requires: string[], check: Function}>} rules
   * @returns {StateContainer} this
   */
  rules(rules) {
    if (this._frozen) {
      throw new Error(`The state container for ${this.meta.resourceType} is frozen`);
    }
    Object.entries(rules).forEach(([action, declaration]) => {
      if (!declaration || typeof declaration.check !== 'function' || !Array.isArray(declaration.requires)) {
        throw new Error(`State rule ${this.meta.resourceType}.${action} must come from rule() or always`);
      }
      this._rules[action] = declaration;
    });
    this._frozen = true;
    return this;
  }

  /** @returns {string[]} the actions this container declares, in declaration order */
  getActionNames() {
    return Object.keys(this._rules);
  }

  /**
   * @param {string} action
   * @returns {{requires: string[], check: Function}}
   * @throws {Error} when the container declares no rule for the action
   */
  getRule(action) {
    const declared = this._rules[action];
    if (!declared) {
      throw new Error(`No state rule for ${this.meta.resourceType}.${action}. `
        + `Declare one in src/state/builtin/${this.meta.resourceType}.js, or always`);
    }
    return declared;
  }

  /**
   * Every field the named actions read, so a caller can fetch them in one query.
   * @param {string[]} [actions] - all of them by default
   * @returns {string[]}
   */
  requiredFields(actions = null) {
    const names = actions ?? this.getActionNames();
    return [...new Set(names.flatMap((action) => this.getRule(action).requires))];
  }

  isFrozen() {
    return this._frozen;
  }
}

module.exports = StateContainer;
