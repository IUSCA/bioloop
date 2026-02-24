/**
 * StateMachine class to manage state transitions with role-based access control.
 *
 * Usage Example:
 *
 * const Roles = {
 *   ADMIN: 'admin',
 *   SYSTEM: 'system',
 * };
 *
 * const config = {
 *   states: ['PENDING', 'CANCELED', 'EXPIRED'],
 *   transitions: [
 *     { from: 'PENDING', to: 'CANCELED', roles: [Roles.ADMIN, Roles.USER] },
 *     { from: 'PENDING', to: 'EXPIRED', roles: [Roles.SYSTEM] },
 *     { from: 'APPROVED', to: 'EXPIRED', roles: [Roles.ADMIN, Roles.SYSTEM] },
 *     { from: 'CANCELED', to: 'PENDING', roles: [Roles.ADMIN] },
 *   ],
 * };
 *
 * function getFSM(status) {
 *   const fsm = new StateMachine(config);
 *   if (status) fsm.setState(status);
 *   return fsm;
 * }
 *
 * const fsm = getFSM('PENDING');
 * console.log(fsm.getCurrentState()); // 'PENDING'
 * console.log(fsm.getAllowedTransitions({ role: Roles.ADMIN })); // ['CANCELED', 'EXPIRED']
 * console.log(fsm.canTransition({ to: 'CANCELED', role: Roles.ADMIN })); // true
 * console.log(fsm.canTransition({ to: 'CANCELED', role: Roles.SYSTEM })); // false
 */
class StateMachine {
  /**
   * Symbol representing a wildcard role that allows any role to perform a transition.
   */
  static ANY_ROLE = Symbol('ANY_ROLE');

  /**
   * Constructs a new StateMachine instance.
   * @param {Object} config - Configuration object for the state machine.
   * @param {string[]} config.states - Array of valid states.
   * @param {Object[]} config.transitions - Array of transition objects.
   * @param {string} config.transitions[].from - The starting state of the transition.
   * @property {string} config.transitions[].to - The target state of the transition.
   * @property {string} config.transitions[].action - The action that triggers the transition.
   * @property {string[]|string} config.transitions[]roles - The roles allowed to perform the transition. Use '*' (string or in array) to allow any role.
   * @property {Function} config.transitions[][guard] - Optional guard function that receives a context object and returns a boolean indicating if the transition is allowed.
   *
   */
  constructor({ states, transitions }) {
    this.states = new Set(states);
    this.transitions = transitions.map((t) => {
      if (!this.states.has(t.from) || !this.states.has(t.to)) {
        throw new Error(`Invalid transition from ${t.from} to ${t.to}`);
      }

      // check if roles is a string or an array of strings
      // if string, check if it is '*'
      // if array, check if it is an array of strings
      // if role is '*' or array contains '*', set roles to ANY_ROLE
      let roles;
      if (typeof t.roles === 'string' && t.roles === '*') {
        roles = new Set([StateMachine.ANY_ROLE]);
      } else if (Array.isArray(t.roles) && t.roles.length > 0 && t.roles.every((r) => typeof r === 'string')) {
        roles = t.roles.includes('*')
          ? new Set([StateMachine.ANY_ROLE])
          : new Set(t.roles);
      } else {
        throw new Error(`Invalid roles for transition from ${t.from} to ${t.to}`);
      }

      // check if guard if not null is a function
      if (t.guard && typeof t.guard !== 'function') {
        throw new Error(`Invalid guard for transition from ${t.from} to ${t.to}`);
      }

      return {
        from: t.from,
        to: t.to,
        action: t.action,
        roles,
        guard: t.guard || null,
      };
    });
    this.currentState = null;
  }

  /**
   * Sets the current state of the state machine.
   * @param {string} state - The state to set as the current state.
   * @throws {Error} If the state is not a valid state.
   */
  setState(state) {
    if (!this.states.has(state)) {
      throw new Error(`Invalid state: ${state}`);
    }
    this.currentState = state;
  }

  /**
   * Gets the current state of the state machine.
   * @returns {string|null} The current state, or null if no state is set.
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Gets all valid states of the state machine.
   * @returns {string[]} Array of valid states.
   */
  getStates() {
    return Array.from(this.states);
  }

  /**
   * Gets the allowed transitions from a given state for a specific role.
   * @param {Object} params - Parameters for determining allowed transitions.
   * @param {string} params.from - The starting state.
   * @param {string} params.role - The role attempting the transition.
   * @returns {string[]} Array of target states that can be transitioned to.
   */
  getAllowedTransitions({ from = null, role, context = {} }) {
    const _from = from || this.currentState;
    if (!this.states.has(_from)) return [];
    return this.transitions
      .filter((t) => t.from === _from
        && (t.roles.has(role) || t.roles.has(StateMachine.ANY_ROLE))
        && (t.guard ? t.guard(context) : true))
      .map((t) => t.to);
  }

  /**
   * Checks if a transition is allowed from one state to another for a specific role.
   * @param {Object} params - Parameters for checking the transition.
   * @param {string} params.from - The starting state.
   * @param {string} params.to - The target state.
   * @param {string} params.role - The role attempting the transition.
   * @returns {boolean} True if the transition is allowed, false otherwise.
   */
  canTransition({
    from = null, to, role, context = {},
  }) {
    const _from = from || this.currentState;
    const transition = this.transitions.find(
      (t) => t.from === _from
        && t.to === to
        && (t.roles.has(role) || t.roles.has(StateMachine.ANY_ROLE)),
    );
    if (!transition) return false;
    if (transition.guard) {
      return transition.guard(context);
    }
    return true;
  }

  // check if a given action is allowed for a specific role from the current state
  canPerformAction({ action, role, context = {} }) {
    const transition = this.transitions.find(
      (t) => t.from === this.currentState
        && t.action === action
        && (t.roles.has(role) || t.roles.has(StateMachine.ANY_ROLE)),
    );
    let allowed = false;
    if (!transition) return { allowed };
    if (transition.guard) {
      allowed = transition.guard(context);
    } else {
      allowed = true;
    }
    return {
      transition,
      allowed,
    };
  }
}

module.exports = StateMachine;
