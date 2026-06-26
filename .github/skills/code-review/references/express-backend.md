# Express.js Backend Review Criteria

## Architecture Overview

This codebase follows a **thin routes + service layer** pattern:
- **Routes** (`src/routes/*.js`): Thin handlers that parse input and call services
- **Services** (`src/services/*.js`): Core business logic, data validation, and database operations
- **Middleware** (`src/middleware/*.js`): Authentication, authorization, validation, error handling
- **Database**: Prisma.js Client (`@/db` singleton) for all database operations

See [API docs](../../docs/api/introduction.md) for full request flow.

## Route Structure

- Routes should be thin — business logic belongs in a service or controller layer, not inline in route handlers.
- Group related routes in a router (`express.Router()`) and mount them in `src/routes/index.js`.
- Route files should export the router, not call `app.use()` directly (except `src/routes/index.js`).
- Flag routes longer than ~40 lines of actual logic — they should be extracted to services.

## Input Validation

**Request validation is already integrated using `express-validator`.** All routes should use the validation framework:

- **All user input must be validated** before use. Flag any route that reads from `req.body`, `req.query`, or `req.params` without validation.
- Use the `validate()` middleware helper from `@/middleware/validators` with `express-validator` rules:
  ```js
  const { validate } = require('@/middleware/validators');
  const { body, query } = require('express-validator');

  router.post('/user',
    validate([
      body('email').isEmail(),
      body('age').isInt({ min: 0 }).toInt(),
    ]),
    asyncHandler(async (req, res) => {
      // req.body is already validated
    })
  )
  ```
- Type coerce/cast route params: `req.params.id` is always a string — cast it (`.toInt()`, `parseInt()`, etc.) before passing to DB.
- **Never trust client-controlled fields for sensitive operations**: `role`, `isAdmin`, `userId` must come from the authenticated session (`req.user`), not `req.body`.

## Authentication and Authorization

- Routes that require authentication must have the auth middleware applied — flag any protected resource without it.
- Prefer middleware-level auth (`router.use(requireAuth)`) over per-route checks where all routes in a file are protected.
- Authorization (can this user access this resource?) must happen after authentication. Flag routes that authenticate but don't check ownership (e.g., `GET /posts/:id` that doesn't verify the post belongs to `req.user`).
- Flag any place where `req.user` is used without first checking it's truthy (it's undefined on unauthenticated requests if middleware isn't applied).

## Error Handling

**Error handling is already integrated at the framework level:**

- **Every async route handler MUST be wrapped in `asyncHandler`** — this is required, not optional. `asyncHandler` catches async errors and passes them to the error handler.
  ```js
  const asyncHandler = require('@/middleware/asyncHandler');

  router.get('/user', asyncHandler(async (req, res) => {
    const user = await userService.findActiveUserBy('username', req.query.username);
    res.json(user);
  }));
  ```
  Flag any async handler without `asyncHandler` wrapping.

- **Custom error handlers** are already configured (`src/middleware/error.js`):
  - `prismaNotFoundHandler`: Handles Prisma record-not-found errors → 404
  - `prismaConstraintFailedHandler`: Handles constraint violations → 409
  - `assertionErrorHandler`: Handles assertion errors → 400
  - `axiosErrorHandler`: Handles HTTP client errors → formatted response
  - `errorHandler`: Catch-all for unhandled errors → 500

- **Errors should be passed to `next(err)`** — don't `console.error()` and leave hanging.
- **No stack traces to client in production**: The error handler guards this automatically.
- Flag `res.send()` inside a catch block without `return` — can cause "headers already sent" errors.

## Response Discipline

- Always return after sending a response. Flag missing `return` before `res.json()` / `res.send()` inside conditionals — can cause "headers already sent" errors.
- Use consistent HTTP status codes: 201 for created, 400 for validation errors, 401 for unauthenticated, 403 for forbidden, 404 for not found, 422 for unprocessable entity, 500 for server errors.
- Response bodies should follow a consistent shape (e.g., `{ data: ... }` or `{ error: "..." }`). Flag inconsistencies.

## Middleware

Middleware order is critical:
1. Logging (`morgan`)
2. Body parsing (`express.json`)
3. Cookie parsing (`cookieParser`)
4. Compression (`compression`)
5. **Authentication** (`authenticate`) — must come before protected routes
6. **Validation** (`validate()`) — before route handlers
7. **Route handlers** (wrapped in `asyncHandler`)
8. **Error handlers** (last in stack)

- **Every async middleware must handle errors**: Use `try/catch` and pass errors to `next(err)`.
- Flag middleware that calls `next()` in some code paths but not others — causes silent hangs.
- **Validation middleware** integrates with `express-validator`: see _Input Validation_ section above.

## Security

- **SQL Injection**: Not applicable in this codebase (Prisma handles parameterization). But flag any `prisma.$queryRaw[]` that uses unvalidated user input directly.
- **CORS**: This project uses **same-origin architecture** (UI and API served from same protocol, hostname, port). CORS middleware is **not needed** and should not be added.
- **Rate limiting**: Login, registration, and password reset endpoints should have rate limiting configured.
- **File uploads**: If `multer` is used, check that file type and size limits are set.
- **Environment variables**: No secrets hardcoded. Use `config/` hierarchy and `.env` files. `.env` must be in `.gitignore`.
- **No sensitive data in logs**: Don't log full request bodies, tokens, passwords, or PII.
- **Prisma Transactions**: Custom ESLint rule `no-original-prisma-inside-tx` enforces using the transaction client inside `prisma.$transaction()` callbacks, not the global `prisma`.
  ```js
  // CORRECT
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ ... })
  })

  // FLAG: violates ESLint rule
  await prisma.$transaction(async (tx) => {
    await prisma.user.create({ ... }) // ❌ uses global prisma, not tx
  })
  ```

## Logging

- Use a proper logger (`pino`, `winston`) rather than `console.log` for anything that should persist in production.
- Flag `console.log` calls left in route handlers (likely debug noise).
- Don't log sensitive fields: passwords, tokens, full request bodies containing PII.
