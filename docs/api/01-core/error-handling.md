# Error Handling
Source: [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)

Error handling is a critical part of any robust application. This feature ensures that errors are properly caught, logged, and handled in a way that provides meaningful feedback to the client while maintaining the integrity of the server. Without proper error handling, unexpected issues could crash the server or expose sensitive information to clients.

This document explains the error-handling mechanisms implemented in this codebase, how they fit into the overall system, and how they help maintain clean, maintainable code.

## Asynchronous Error Handler
Express (versions below 5) does not automatically catch errors thrown in asynchronous code. To address this, an `asyncHandler` middleware is used to wrap asynchronous route handlers. This middleware ensures that any errors are passed to the default error handler.

### Why It Exists
Without this middleware, developers would need to manually wrap every asynchronous route handler in a `try-catch` block, leading to repetitive and error-prone code.

### Usage
Wrap your asynchronous route handlers with `asyncHandler` to automatically catch errors and pass them to the error handler.

```javascript
const asyncHandler = require('../middleware/asyncHandler');

router.get('/user', asyncHandler(async (req, res, next) => {
    const user = await userService.findActiveUserBy(
      'username', req.query.username
    );
    res.json(user);
}));
```

This replaces the need for manual `try-catch` blocks:

```javascript
router.get('/user', async (req, res, next) => {
  try {
    const user = await userService.findActiveUserBy('username', req.query.username);
    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

## The Default Error Handler
The default error handler is the last middleware in the stack. It ensures that all unhandled errors are processed and a proper response is sent to the client.

### Key Features
- Sets `res.statusCode` based on `err.status` or defaults to 500.
- Sends a generic error message in production or the stack trace in development.
- Prevents sensitive information from being exposed to clients.

### Custom Default Error Handler
The custom error handler (`errorHandler`) logs errors to the console and sends appropriate responses to clients:
- For HTTP errors (e.g., `createError(400, 'foo bar')`), the client receives the message and status code.
- For non-HTTP errors (e.g., `new Error('business logic error')`), a generic message is sent to the client.

### Example
```javascript
app.use(errorHandler);
```

## Custom Error Handlers
Custom error handlers are used to handle specific types of errors before they reach the default error handler.

### 404 Handler
The `notFound` middleware catches requests to unknown routes and forwards a 404 error.

```javascript
app.use(notFound);
```

### Prisma Not Found Error Handler
Prisma's query engine may throw opaque errors when a resource is not found. The `prismaNotFoundHandler` middleware intercepts these errors and converts them into HTTP 404 responses.

#### Example
Before refactoring:
```javascript
router.delete('/:username', asyncHandler(async (req, res, next) => {
  try {
    const deletedUser = await userService.softDeleteUser(req.params.username);
    res.json(deletedUser);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e?.meta?.cause?.includes('not found')) {
      return next(createError.NotFound());
    }
    return next(e);
  }
}));
```

After refactoring:
```javascript
app.use(prismaNotFoundHandler);

router.delete('/:username', asyncHandler(async (req, res, next) => {
  const deletedUser = await userService.softDeleteUser(req.params.username);
  res.json(deletedUser);
}));
```

### Prisma Constraint Violation Handler
Handles database constraint violations (e.g., unique constraints) and sends appropriate HTTP responses.

#### Example
Before refactoring:
```javascript
router.post('/', asyncHandler(async (req, res, next) => {
  try {
    const newUser = await userService.createUser(req.body);
    res.json(newUser);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return next(createError.Conflict('User already exists'));
    }
    return next(e);
  }
}));
```

After refactoring:
```javascript
app.use(prismaConstraintFailedHandler);

router.post('/', asyncHandler(async (req, res, next) => {
  const newUser = await userService.createUser(req.body);
  res.json(newUser);
}));
```

### Assertion Error Handler
Catches `AssertionError` instances and sends a 400 Bad Request response.

#### Example
Before refactoring:
```javascript
const assert = require('assert');
router.post('/', asyncHandler(async (req, res, next) => {
  try {
    assert(req.body.username, 'Username is required');
    const newUser = await userService.createUser(req.body);
    res.json(newUser);
  } catch (e) {
    if (e instanceof assert.AssertionError) {
      return next(createError.BadRequest(e.message));
    }
    return next(e);
  }
}));
```

After refactoring:
```javascript
app.use(assertionErrorHandler);

router.post('/', asyncHandler(async (req, res, next) => {
  assert(req.body.username, 'Username is required');
  const newUser = await userService.createUser(req.body);
  res.json(newUser);
}));
```

### Axios Error Handler
Handles errors from Axios HTTP requests, logs them, and sends a 500 Internal Server Error response.

#### Example
Before refactoring:
```javascript
const axios = require('axios');

router.get('/user', asyncHandler(async (req, res, next) => {
  try {
    const response = await axios.get('https://api.example.com/user');
    res.json(response.data);
  } catch (e) {
    if (e.response) {
      return next(createError(e.response.status, e.response.statusText));
    }
    return next(e);
  }
}));
```

After refactoring:
```javascript
app.use(axiosErrorHandler);

router.get('/user', asyncHandler(async (req, res, next) => {
  const response = await axios.get('https://api.example.com/user');
  res.json(response.data);
}));
```

## Integration into the System
Error-handling middleware is registered in `app.js` in the following order:
1. `notFound` for unknown routes.
2. Prisma-specific handlers (`prismaNotFoundHandler`, `prismaConstraintFailedHandler`).
3. Other custom handlers (`assertionErrorHandler`, `axiosErrorHandler`).
4. `errorHandler` as the final fallback.

This layered approach ensures that errors are handled at the appropriate level, keeping the codebase clean and maintainable.

## Summary
By centralizing error handling, this system:
- Reduces repetitive code.
- Improves maintainability.
- Ensures consistent error responses.
- Protects sensitive information.

Follow the examples above to integrate error handling into your routes and middleware.
