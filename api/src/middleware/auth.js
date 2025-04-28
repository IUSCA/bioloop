const createError = require('http-errors');
const _ = require('lodash/fp');
const config = require('config');

const authService = require('../services/auth');
const { setIntersection } = require('../utils');
const ac = require('../services/accesscontrols');
const nonceService = require('../services/nonce');
const logger = require('../services/logger');
const constants = require('../constants');

const asyncHandler = require('./asyncHandler');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader) return next(createError.Unauthorized('Authentication failed. Token not found.'));

  const err = createError.Unauthorized('Authentication failed. Token is not valid.');
  if (!authHeader.startsWith('Bearer ')) { return next(err); }
  const token = authHeader.split(' ')[1];

  const auth = authService.checkJWT(token);
  if (!auth) return next(err);

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
  { checkOwnership = false } = {},
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
    //   resource, action, checkOwnership, resourceOwner, requester, roles,
    // });

    if (roles && roles.length > 0) {
      const acQuery = ac.can(roles);
      const permission = (checkOwnership && requester === resourceOwner)
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

function getPermission({
  resource,
  action,
  requester_roles,
  checkOwnership = false,
  requester,
  resourceOwner,
}) {
  const actions = buildActions(action);
  // filter user roles that match defined roles
  const roles = [...setIntersection(ac.getRoles(), requester_roles || [])];
  if (roles && roles.length > 0) {
    const acQuery = ac.can(roles);
    return (checkOwnership && requester === resourceOwner)
      ? acQuery[actions.own](resource)
      : acQuery[actions.any](resource);
  }
}

const loginHandler = asyncHandler(async (req, res, next) => {
  const user = req.auth?.user;
  if (user) {
    const resObj = await authService.onLogin({ user, method: req.auth?.method });

    if (user.roles.includes('admin')) {
      // set cookie
      res.cookie('grafana_token', authService.issueGrafanaToken(user), {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
    } else {
      // if user is not an admin, clear the cookie
      res.clearCookie('grafana_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
    }

    resObj.status = constants.auth.verify.response.status.SUCCESS;
    return res.json(resObj);
  }
  // User was authenticated but they are not a portal user
  if (config.get('auth.signup.enabled')) {
    const email = req.auth?.identity?.email;
    if (!email) {
      logger.error('User authenticated but no email found in identity returned by the provider');
      return next(createError.InternalServerError());
    }
    const nonce = await nonceService.createNonce();
    const signup_token = authService.issueSignupToken({ email, nonce });
    return res.json({
      status: constants.auth.verify.response.status.SIGNUP_REQUIRED,
      email,
      signup_token,
    });
  }
  return res.json({
    status: constants.auth.verify.response.status.NOT_A_USER,
    message: 'The user is authenticated but not recognized as a portal user.',
  });
});

module.exports = {
  authenticate,
  accessControl,
  getPermission,
  loginHandler,
};
