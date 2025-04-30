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
   * @param {string} config.transitions[].to - The target state of the transition.
   * @param {string[]} config.transitions[].roles - Array of roles allowed to perform the transition.
   */
  constructor({ states, transitions }) {
    this.states = new Set(states);
    this.transitions = transitions.map((t) => ({
      from: t.from,
      to: t.to,
      roles: new Set(t.roles),
    }));
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
  getAllowedTransitions({ from = null, role }) {
    const _from = from || this.currentState;
    if (!this.states.has(_from)) return [];
    return this.transitions
      .filter((t) => t.from === _from
        && (t.roles.has(role) || t.roles.has(StateMachine.ANY_ROLE)))
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
  canTransition({ from = null, to, role }) {
    const _from = from || this.currentState;
    return this.transitions.some(
      (t) => t.from === _from
        && t.to === to
        && (t.roles.has(role) || t.roles.has(StateMachine.ANY_ROLE)),
    );
  }
}

module.exports = StateMachine;
