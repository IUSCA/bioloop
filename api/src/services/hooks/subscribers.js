/**
 * Who listens to which lifecycle hook.
 *
 * Registration is here rather than inside each module so that the whole set is readable in
 * one place, and so that a handler cannot be registered twice by two different importers.
 * `src/app.js` requires this once at startup.
 *
 * A handler nobody registered fails silently, which is the failure mode this file exists to
 * make visible. A test asserts that requiring this module registers the invitation handler.
 */

const { applyInvitationsForNewUser } = require('@/services/invitations/hook');
const hooks = require('./index');

hooks.on(hooks.USER_CREATED, applyInvitationsForNewUser);
