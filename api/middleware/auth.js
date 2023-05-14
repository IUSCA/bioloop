const createError = require('http-errors');
const _ = require('lodash/fp');

const authService = require('../services/auth');
const { setIntersection } = require('../utils');
const ac = require('../services/accesscontrols');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader) return next(createError.Unauthorized('Authentication failed. Token not found.'));

  if (!authHeader.startsWith('Bearer ')) return next(createError.Unauthorized('Authentication failed. Token is not valid.'));
  const token = authHeader.split(' ')[1];

  const auth = authService.checkJWT(token);
  if (!auth) return next(createError.Unauthorized('Authentication failed. Token is not valid.'));

  req.user = auth.profile;
  next();
}

// function checkRole(role) {
//   // role can be a string indicating single role or an array of strings
//   // to check for multiple roles
//   // in case of multiple roles, user is allowed if they have at least one of the provided roles
//   return (req, res, next) => {
//     const userRoles = req?.user?.roles || [];
//     const allowedRoles = Array(role).flat().concat('superuser');
//     const authorized = allowedRoles.some((r) => userRoles.includes(r));
//     if (!authorized) {
//       return next(createError.Forbidden('Not permitted'));
//     }
//     next();
//   };
// }

function buildActions(action) {
  const actions = {};

  switch (action) {
    case 'create':
      actions.any = 'createAny';
      actions.own = 'createOwn';
      break;

    case 'update':
      actions.any = 'updateAny';
      actions.own = 'updateOwn';
      break;

    case 'read':
      actions.any = 'readAny';
      actions.own = 'readOwn';
      break;

    case 'delete':
      actions.any = 'deleteAny';
      actions.own = 'deleteOwn';
      break;

    default:
      throw new Error('invalid action');
  }
  return actions;
}

const accessControl = _.curry((
  resource,
  action,
  checkOwnerShip = true,
  // resourceOwnerFn = null,
  // requesterFn = null,
) => {
  // https://github.com/pawangspandey/accesscontrol-middleware/blob/master/index.js
  const actions = buildActions(action);
  // const _resourceOwnerFn = resourceOwnerFn || ((req) => req.params.username);
  // const _requesterFn = requesterFn || ((req) => req.user.username);
  return (req, res, next) => {
    // filter user roles that match defined roles
    const roles = [...setIntersection(ac.getRoles(), req?.user?.roles || [])];
    const resourceOwner = req.params.username; // _resourceOwnerFn(req);
    const requester = req.user?.username; // _requesterFn(req);

    // console.log('access-controls', {
    //   resource, action, checkOwnerShip, resourceOwner, requester, roles,
    // });

    if (roles && roles.length > 0) {
      const acQuery = ac.can(roles);
      const permission = (checkOwnerShip && requester === resourceOwner)
        ? acQuery[actions.own](resource)
        : acQuery[actions.any](resource);
      if (permission.granted) {
        req.permission = permission;
        return next();
      }
    }
    return next(createError(403));
  };
});

module.exports = {
  authenticate,
  accessControl,
};
