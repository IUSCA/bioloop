const createError = require('http-errors');
const _ = require('lodash/fp');

const authService = require('../services/auth');
const { setIntersection } = require('../utils');
const { ac } = require('../services/accesscontrols');
const nonceService = require('../services/nonce');
const logger = require('../services/logger');
const constants = require('../constants');
const { isFeatureEnabled } = require('../services/features');

const asyncHandler = require('./asyncHandler');

const TOKEN_NOT_FOUND_ERROR = 'Authentication failed. Token not found.';
const TOKEN_INVALID_ERROR = 'Authentication failed. Token is not valid.';

function authenticateWithHeader(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader) throw createError.Unauthorized(TOKEN_NOT_FOUND_ERROR);

  const err = createError.Unauthorized(TOKEN_INVALID_ERROR);
  if (!authHeader.startsWith('Bearer ')) { throw err; }
  const token = authHeader.split(' ')[1];

  const auth = authService.checkJWT(token);
  if (!auth) throw err;
  return auth.profile;
}

function authenticateWithCookie(req) {
  const token = req.cookies[constants.JWT_COOKIE_NAME];
  if (!token) throw createError.Unauthorized(TOKEN_NOT_FOUND_ERROR);

  const err = createError.Unauthorized(TOKEN_INVALID_ERROR);
  const auth = authService.checkJWT(token);
  if (!auth) throw err;
  return auth.profile;
}

function authenticate(req, res, next) {
  // try to authenticate with header first, then fallback to cookie
  try {
    req.user = authenticateWithHeader(req);
  } catch (err) {
    if (err.status === 401) {
      try {
        req.user = authenticateWithCookie(req);
      } catch (cookieErr) {
        if (cookieErr.status === 401) {
          // if both header and cookie authentication fail, return 401
          return next(createError.Unauthorized('Authentication failed. No valid authentication method found.'));
        }
        // if cookie authentication fails for any other reason, return that error
        return next(cookieErr);
      }
    } else {
      // if header authentication fails for any other reason, return that error
      return next(err);
    }
  }
  next();
}

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
  resourceOwnerFn = null,
  // requesterFn = null,
) => {
  // https://github.com/pawangspandey/accesscontrol-middleware/blob/master/index.js
  const actions = buildActions(action);
  // const _resourceOwnerFn = resourceOwnerFn || ((req) => req.params.username);
  // const _requesterFn = requesterFn || ((req) => req.user.username);
  return async (req, res, next) => {
    // filter user roles that match defined roles
    const roles = [...setIntersection(ac.getRoles(), req?.user?.roles || [])];
    const resourceOwner = resourceOwnerFn ? await resourceOwnerFn(req, res, next) : req.params.username;
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

    // set JWT cookie
    res.cookie(constants.JWT_COOKIE_NAME, resObj.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    });

    if (user.roles.includes('admin')) {
      // set cookie
      res.cookie(constants.GRAFANA_COOKIE_NAME, authService.issueGrafanaToken(user), {
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
  if (isFeatureEnabled({ key: 'signup' })) {
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
  rbacAccessControl: accessControl, // alias for backward compatibility
  getPermission,
  loginHandler,
};
