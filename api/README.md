# API

## Getting Started

Create a `.env` file from the template `.env.example`: 
```bash
cp .env.example .env
``` 
and populate the config values to all the keys.

### Running using docker
In the developement environment with docker this is the content of `.env` file

```bash
NODE_ENV=docker
DATABASE_PASSWORD='example'
DATABASE_URL="postgresql://appuser:example@postgres:5432/app?schema=public"
```
From the project root run: `docker compose up postgres api -d` to start both the API server and the database

### Running on host machine

Start a postgres db server on localhost and create a database `app` and user `appuser` (password: `example`) with write premissions to public schema. In this local environment, the content of `.env` file is:

```bash
NODE_ENV=default
DATABASE_PASSWORD='example'
DATABASE_URL="postgresql://appuser:example@localhost:5432/app?schema=public"
```

Run `pnpm install` and `pnpm start` to start the API server.

## Features:
- Query and body parser, cookie parser, response compression, and CORS
- [Error Handling](#error-handling)
  - [Async error handler](#asynchronous-error-handler)
  - [Default error handler](#the-default-error-handler)
  - [Prisma not found handler](#prisma-not-found-error-handler)
  - [404 Not Found handler](#404-handler)
- Logger
  - log incoming requests
  - multi-level logger: ex: `logger.info()`
  - log timestamps
- [Hierarchical layered configuration](#config)
- [IU CAS authentication](#authentication)
- JWT based stateless session management
- [Role Based Access Control](#authorization-role-based-access-control)
- [Request Validation](#request-validation)
- [Auto generated swagger documentation](#auto-generated-swagger-documentation)
- Prisma + Postgres ORM

Developer Exprience
- Auto reload:  `nodemon index.js`
- [Linting](#linting)
    - auto highligt linting errors
    - format on save
- Consistent Coding styles with editorconfig

Production deployment:
- pm2
- docker

Assumptions:
- there is a reverse proxy which handles security headers as we are not using `helmet` module.

## Typical request flow through the Express Server
1. Express creates a [`request`](https://expressjs.com/en/4x/api.html#req) object that represents the HTTP request and has properties for the request query string, parameters, body, HTTP headers, and so on.
2. [app.js](src/app.js) - The body, query parameters, and cookies are parsed and converted to objects and `req` object is updated.
3. [app.js](src/app.js) - CORS?
4. [Index Router](src/routers/index.js) - Intial [routing](https://expressjs.com/en/guide/routing.html) is performed to select a sub-router to send the request to. 
5. [Authentication](#authentication) - Validate JWT and attach user profile to `req.user` or send 401 error response<sup>*</sup>. 
6. [AceessControl](#authorization-role-based-access-control) - Determine whether the requester has enough permissions to perform the desired operation on a particular resource and attach the permission object to `req.permission` or send 403 error response.
7. [Request Validation](#request-validation) - Validate if the request query, params, or the body is in expected format or send 400 error.
8. [Async Handler](#asynchronous-error-handler) - Envolpe the business logic route middleware to catch async error and propagate them to global error handler.
9. **Route Handler - Business Logic** - create and send the response.
10. [Compression](https://expressjs.com/en/resources/middleware/compression.html) - Apply gZip compression to the response body.
11. Express server sets some default headers and sends the [response](https://expressjs.com/en/4x/api.html#res) to the client.


### When something goes wrong

10. [404 Handler](#404-handler) - Handle routing failures and send 404 error response.
11. [Prisma Not Found handler](#prisma-not-found-error-handler) - Handle not found prisma errors and send 404 error response.
12. [Global error handler](#custom-default-error-handler) - Handle all other errors and send 500 error response.
13. [Compression](https://expressjs.com/en/resources/middleware/compression.html) - Apply gZip compression to the response body.
14. Express server sets some default headers and sends the [response](https://expressjs.com/en/4x/api.html#res) to the client.

\* For the routes that are registered before `authenticate` such as `/health` and `/auth`, this middleware not invoked.

## Project Structure
files in `src/`
- `index.js` - import app and start
- `app.js` - create and configure express application
- `routes/index.js` - main router
- `routes/*.js` - modular routes
- `middleware/*.js` - express middleware functions
- `services/*.js` - common code specific to this project seperated by usage in router
- `services/logger.js` - winston logger
- `config/*.json` - hierarchical configuration
- `prisma/schema.prisma` - Data definitions
- `prisma/data.js` - code to initialize tables with some data
- `utils/index.js` - non-specific common code

## Error Handling
Source: [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)

- Express automatically handles errors thrown in the synchronous code, however it cannot catch errors thrown from asynchronous code (in versions below 5). These have to be caught and passed on to the `next` function.
- The error thrown from the sync code in the middleware are handled and passed on to the `next` automatically.
- When `next` is called with any argument except `'route'`, express assumes it is due to an error and skips any remaining non-error handling routing and middleware functions.

### Asynchronous Error Handler
`asyncMiddleware` in [middleware/error.js](src/middleware/asyncHandler.js)

Usage: Wrap the route handler middleware with `asyncHandler` to produce a middleware funtion that can catch the asynchronous error and pass on to the default error handler.


```javascript
const asyncHandler = require('../middleware/asyncHandler');

router.get('/user', asyncHandler(async (req, res, next) => {
    const user = await userService.findActiveUserBy('username', req.query.username);
    res.json(user)
}))
```

instead of

```javascript
router.get('/user', async (req, res, next) => {
  try {
    const user = await userService.findActiveUserBy('username', req.query.username);
    res.json(user)
  } catch(err) {
    next(err)
  }
})
```


### The Default Error Handler
- The default error handler is added at the end of the middleware function stack
- The `res.statusCode` is set from `err.status` (or `err.statusCode`). If this value is outside the 4xx or 5xx range, it will be set to 500.
- The `res.statusMessage` is set according to the status code.
- The body will be the HTML of the status code message when in production environment, otherwise will be `err.stack`. (environment variable NODE_ENV=production)

### Custom Default Error Handler
- `errorHandler` in [middleware/error.js](src/middleware/error.js)
- Logs error to console
- send actual message to client only if `err.expose` is true otherwise send a generic Internal server error.  For http errors such as (`throw createError(400, 'foo bar')`), the client receives `{"message":"foo bar"}` with status code to 400.
- For non http errors such as  `throw new Error('business logic error')`, only the `err.message` is set others are not. For such error, this handler will send a generic message. Client's will not see `business logic error` in thier response object.
- Does not log to console stack trace for 4xx errors

### 404 handler
- `notFound` in [middleware/error.js](src/middleware/error.js)

### http-errors module:
- Helps to create http specific error objects which can be thrown or passed to next
```javascript
err = createError(404, 'user not found')
return next(err)
```
- Provides list of constructors to make the code readable - https://github.com/jshttp/http-errors

```javascript
return next(createError.NotFound())
```
this will automatically set correct error message based on the constructor.

- Create an error with expose being true: `createError(502, 'foo', { expose: true })`


### Prisma Not Found Error Handler
Prisma returns opaque error objects from the underlying query engine when DB queries fail. One such common error that must be handled everytime a DB query is made is the **Not Found** error. 

HTTP semantics require that if a resource cannot be found either while retrieving, updating or deleting the response should be sent 404 status code. In order to achieve this, the errors from the prisma code have to be caught and analysed for the **Not Found** errors. 

A typical example of handling a not found error and returning 404 response:

```javascript
router.delete(
  '/:username',
  asyncHandler(async (req, res, next) => {
    try{
      const deletedUser = await userService.softDeleteUser(req.params.username);
      res.json(deletedUser);
    } catch(e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e?.meta?.cause?.includes('not found')) {
          return next(createError.NotFound());
        }
      }
      return next(e);
    }
  }),
);
```

Here, the errors other than not found are propagated to the error handler by `next(e)`.

The try-catch code can be refactored to a middleware that intercepts all errors before the Custom default error handler. The above code after refactoring looks like:

`app.js`
```javascript
const { prismaNotFoundHandler } = require('./middleware/error');
app.use(prismaNotFoundHandler);
```

`routes/*.js`
```javascript
router.delete(
  '/:username',
  asyncHandler(async (req, res, next) => {
    const deletedUser = await userService.softDeleteUser(req.params.username);
    res.json(deletedUser);
  }),
);
```
Now, the routes' business logic code is cleaner and 404s are automatically when prisma ORM throws not found errors. If you want to send other HTTP status codes, intercept the prisma error in your route handler without propagating it.


## Linting

Eslint rules inherited from `eslint-config-airbnb-base` and [Lodash-fp ruleset](https://www.npmjs.com/package/eslint-plugin-lodash-fp).

## Config

Uses config module - https://github.com/node-config/node-config

Configurations are stored in [configuration files](https://github.com/node-config/node-config/wiki/Configuration-Files) within your application, and can be overridden and extended by [environment variables](https://github.com/lorenwest/node-config/wiki/Environment-Variables), [command line parameters](https://github.com/node-config/node-config/wiki/Command-Line-Overrides), or [external sources](https://github.com/lorenwest/node-config/wiki/Configuring-from-an-External-Source).

config files: `default.json`, `production.json`, `custom-environment-variables.json` in `./config/` directory.

precdence of config: command line > environment > {NODE_ENV}.json > default.json

The properties to read and override from environment is defined in `custom-environment-variables.json`

### Loading environment variables

```javascript
require('dotenv-safe').config();
```

## Authentication

The API uses IU CAS authnetication model. 

<img src="docs/assets/api_auth.png" >

All the routes and sub-routers added after the [`authenticate`](src/middleware/auth.js) middleware in [index router](src/routes/index.js) require authentication. The routes that do not require authentication such as [auth routes](src/routes/auth.js) are added before this.

The [`authenticate`](src/middleware/auth.js) middleware, parses the `Authorization` header for the bearer token and cryptographically verifies the JWT. If the JWT is deemed valid, the payload is decoded and added to the request as `req.user`

To add authentication to a single route:
```javascript
const { authenticate } = require('../middleware/auth');

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  const user = await userService.findActiveUserBy('username', req.user.username);
  // ...
}))
```

## Request Validation

Uses [express-validator](https://express-validator.github.io/docs/) to validate if the request query, params, or the body is of the expected format and has acceptable values. This module helps to write declarative code that reduces repeatitive Spaghetti safety checking code inside the route handler. The route can now confidently presume that all of the required properties/keys of `req.params`, `req.query`, or `req.body` exist and have appropriate values and optional keys set to default values.


Using the [`validate`](src/middleware/validators.js) higher order function, the error checking code is factored out from the route specific middleware functions.

```javascript
app.post(
  '/user',
  body('username').isEmail(),
  body('password').isLength({ min: 5 }),
  (req, res) => {
    // Finds the validation errors in this request and wraps them in an object with handy functions
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    User.create({
      username: req.body.username,
      password: req.body.password,
    }).then(user => res.json(user));
  },
);
```

becomes

```javascript
const validate = require('middleware/validators')
app.post(
  '/user',
  validate([
    body('username').isEmail(),
    body('password').isLength({ min: 5 }),
  ]),
  asyncHandler(async (req, res) => {
    const user = await User.create({
      username: req.body.username,
      password: req.body.password,
    });
    res.json(user);
  },
));
```

## Authorization: Role Based Access Control

[accesscontrol](https://www.npmjs.com/package/accesscontrol) library is used to provide role based authorization to routes (resources).

Roles in this application:
- user
- operator
- admin
- superadmin

Each role defines CRUD permissions on resources with two scopes: "own" and "any". These are configured in [services/accesscontrols.js](src/services/accesscontrols.js).

The goal of the [accessControl](src/middleware/auth.js) middleware is to determine from an incoming request whether the requester has enough permissions to perform the desired operation on a particular resource.

`req.permission.filter`: Uses [Notation](https://www.npmjs.com/package/notation) to filter attributes.

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

## Auto-generated Swagger Documentation

1. Add `// #swagger.tags = ['<sub-router>']` comment to the code of the route handler and replace `sub-router` with a valid name that describes the family of routes (ex: User, Dataset, etc).
2. Run `npm run swagger-autogen` to generate the documentation.
3. Visit `http://<api-host>:<api-port>/docs`

Files:
- `swagger.js` - script that generates the documentation. Configures the output file, the router to generate routes and other common config.
- `swagger_output.json` - generated routes, not included in the version control.

Source: https://medium.com/swlh/automatic-api-documentation-in-node-js-using-swagger-dd1ab3c78284
