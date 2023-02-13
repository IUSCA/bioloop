const createError = require('http-errors');

const authService = require('../services/auth.service');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next(createError.Unauthorized());

  const token = authHeader.split(' ')[1];
  const auth = authService.checkJWT(token);
  if (!auth) return next(createError.Unauthorized());

  req.user = auth.profile;
  next();
}

function checkRole(role) {
  // role can be a string indicating single role or an array of strings to check for multiple roles
  // in case of multiple roles, user is allowed if they have at least one of the provided roles
  return (req, res, next) => {
    const userRoles = req?.user?.roles || [];
    const allowedRoles = Array(role).flat().concat('superuser');
    const authorized = allowedRoles.some((r) => userRoles.includes(r));
    if (!authorized) {
      return next(createError.Forbidden('Not permitted'));
    }
    next();
  };
}

module.exports = {
  authenticate,
  checkRole,
};
