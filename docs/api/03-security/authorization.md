# Authorization

Role Based Access Control

[accesscontrol](https://www.npmjs.com/package/accesscontrol) library is used to provide role based authorization to routes (resources).

Roles in this application:
- user
- operator
- admin
- superadmin

Each role defines CRUD permissions on resources with two scopes: "own" and "any". These are configured in [services/accesscontrols.js](src/services/accesscontrols.js).

The goal of the [accessControl](src/middleware/auth.js) middleware is to determine from an incoming request whether the requester has enough permissions to perform the desired operation on a particular resource.

### A simple use case: 

**Objective**: Users with `user` role are only permitted to read and update thier own profile. Whereas, users with `admin` role can create new users, read & update any user's profile, and delete any user.

**Role design**:
- roles: `admin`, `user`
- actions: CRUD
- resource: `user`

```javascript
{
  admin: {
    user: {
      'create:any': ['*'],
      'read:any': ['*'],
      'update:any': ['*'],
      'delete:any': ['*'],
    },
  },
  user: {
    user: {
      'read:own': ['*'],
      'update:own': ['*'],
    },
  },
}
```

**Permission check**:

Code to check if the requester to is authorized to `GET /users/dduck`. This route is protected by `authenticate` middleware which attaches the requester profile to `req.user` if the token is valid.

```javascript
const { authenticate } = require('../middleware/auth');

router.get('/:username',
  authenticate,
  asyncHandler(async (req, res, next) => {
    
    const roles = req.user.roles;
    const resourceOwner = req.params.username;
    const requester = req.user?.username;

    const permission = (requester === resourceOwner)
        ? ac.can(roles).readOwn('user')
        : ac.can(roles).readAny('user');
    
    if (!permission.granted) {
      return next(createError(403)); // Forbidden
    }
    else {
      const user = await userService.findActiveUserBy('username', req.params.username);
      if (user) { return res.json(user); }
      return next(createError.NotFound());
    }
  }),
);
```

readOwn permission is verified against user roles if the requester and resource owner are the same, otherwise readAny permission is examined. If the requester has only `user` role and is requesting the profile of other users, the request will be denied.

### AccessControl Middleware Usage

[accessControl](src/middleware/auth.js) middleware is a generic function to handle authorization for any action or resource with optional ownership checking.

The above code can be written consicely with the help of accessControl middleware.

`routes/*.js`
```javascript
// import middleware
const { authenticate, accessControl } = require('../middleware/auth');

// configre the middleware to authorize requests to user resource
// resource ownership is checked by default
// throws 403 if not authorized
const isPermittedTo = accessControl('user');

//
router.get(
  '/:username',
  authenticate,
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    const user = await userService.findActiveUserBy('username', req.params.username);
    if (user) { return res.json(user); }
    return next(createError.NotFound());
  }),
);
```