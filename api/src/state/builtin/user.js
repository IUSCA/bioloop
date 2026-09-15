const StateContainer = require('../core/StateContainer');
const { always } = require('../core/rules');

/**
 * What a user's state admits.
 *
 * The directory listing reads people, and no state of a user closes it. A soft-deleted user is
 * filtered by the query rather than refused here.
 */
const userState = new StateContainer({
  resourceType: 'user',
  description: 'No state of a user closes the directory',
}).rules({
  list: always,
});

module.exports = { userState };
