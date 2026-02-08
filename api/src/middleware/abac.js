const _ = require('lodash/fp');

const createError = require('http-errors');
const policies = require('../authorization/policies');

const DEFAULT_REQUESTER_FN = (req) => req.user?.username;
const DEFAULT_RESOURCE_OWNER_FN = (req) => req.params?.username;

function authorize(
  resource_name,
  action_name,
  { requesterFn = null, resourceOwnerFn = null } = {},
) {
  const policy = policies.getPolicy(resource_name, action_name);

  const getRequester = (requesterFn && typeof requesterFn === 'function')
    ? requesterFn
    : DEFAULT_REQUESTER_FN;
  const getResourceOwner = (resourceOwnerFn && typeof resourceOwnerFn === 'function')
    ? resourceOwnerFn
    : DEFAULT_RESOURCE_OWNER_FN;

  return async (req, res, next) => {
    const requester = await getRequester(req);
    const resourceOwner = await getResourceOwner(req);
    const isResourceOwner = requester && resourceOwner && requester === resourceOwner;
    const ctx = {
      isResourceOwner,
    };
    const permission = policy ? policy(req.user, null, ctx) : false;
    if (permission?.granted) {
      req.permission = permission;
      return next();
    }
    return next(createError(403));
  };
}

module.exports = {
  authorize: _.curry(authorize),
};
