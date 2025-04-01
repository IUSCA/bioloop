---
title: Introduction
order: 0
---
# Introduction

Developing robust and maintainable backend services requires a structured approach without unnecessary complexity. This framework extends Express.js by providing a set of utility functions that facilitate the development of production-ready applications. No additional abstractions have been introduced, ensuring that developers familiar with Express can use it without a learning curve. Essential features such as validation, authentication, logging, and metrics are integrated, offering a streamlined development experience. A fully configured development environment can be initialized with a single command, incorporating linting, hot reloading, and best-practice defaults.

## Philosophy

### **Minimal Abstractions**

Rather than introducing new layers of abstraction, the framework enhances Express through structured utility functions. Full control over request handling is maintained while offering built-in tools for middleware management, configuration, and error handling.

### **Comprehensive Feature Set**

A variety of essential features required for modern web applications, including authentication, logging, and observability, have been integrated. This approach allows teams to focus on application logic rather than spending time configuring third-party packages.

### **Adherence to Best Practices**

The framework is structured to promote modular and maintainable code. The use of Prisma for database management, OpenAPI documentation, and structured logging ensures consistency and maintainability across projects.

### **Optimized Developer Experience**

A complete development environment can be set up using a single command through Docker Compose. Automated linting, nodemon-based reloads, and process clustering have been included to improve efficiency and reduce development overhead.

By emphasizing simplicity, flexibility, and adherence to best practices, this framework enables the development of scalable and maintainable Express applications while minimizing complexity.

## Example

routes.index.js
![Router Explained](/api/router-explained.png)


routes/resources.js
![Middleware Explained](/api/middleware-explained.png)

## Typical Request Flow Through the Express Server

| Step | Component | Description |
|------|----------|-------------|
| 1 | Express Server | Receives an HTTP request |
| 2 | Middleware | Parses request body, query, and cookies |
| 3 | Middleware | Enforces CORS policies |
| 4 | Router | Routes request to appropriate sub-router |
| 5 | Authentication | Validates JWT, attaches user to request |
| 6 | Access Control | Checks permissions |
| 7 | Validation | Ensures request format is correct |
| 8 | Async Error Handler | Wraps route handlers for error management |
| 9 | Business Logic | Executes request-specific logic |
| 10 | Middleware | Applies gzip compression |
| 11 | Express Server | Sends response to client |

Error Handling Steps:
| Step | Component | Description |
|------|----------|-------------|
| 10 | 404 | Handle routing failures |
| 11 | Custom Error Handlers | Handle specific errors |
| 12 | Global Error Handler | Handle all other errors |
| 13 | Middleware | Applies gzip compression |
| 14 | Express Server | Sends response to client |

Detailed Steps:

1. Express creates a [`request`](https://expressjs.com/en/4x/api.html#req) object that represents the HTTP request and has properties for the request query string, parameters, body, HTTP headers, and so on.
2. `src/app.js` - The body, query parameters, and cookies are parsed and converted to objects, and the `req` object is updated.
3. `src/app.js` - Apply CORS policies to handle cross-origin requests.
4. Main Router (`src/routers/index.js`) - Initial [routing](https://expressjs.com/en/guide/routing.html) is performed to select a sub-router to send the request to.
5. [Authentication](03-security/authentication) - Validate JWT and attach the user profile to `req.user` or send a 401 error response<sup>*</sup>.
6. [Access Control](03-security/authorization) - Determine whether the requester has sufficient permissions to perform the desired operation on a particular resource. Attach the permission object to `req.permission` or send a 403 error response.
7. [Request Validation](01-core/validation) - Validate if the request query, parameters, or body is in the expected format, or send a 400 error response.
8. [Async Handler](01-core/error-handling.html#asynchronous-error-handler) - Wrap the business logic route middleware to catch asynchronous errors and propagate them to the global error handler.
9. **Route Handler - Business Logic** - Execute the business logic and create the response.
10. [Compression](https://expressjs.com/en/resources/middleware/compression.html) - Apply gzip compression to the response body.
11. Express server sets default headers and sends the [response](https://expressjs.com/en/4x/api.html#res) to the client.

### When Something Goes Wrong

10. [404 Handler](01-core/error-handling.html#_404-handler) - Handle routing failures and send a 404 error response.
11. [Custom Error Handlers](01-core/error-handling.html#custom-error-handlers) - Handle prisma, assertions, axios errors and send appropriate error responses.
12. [Global Error Handler](01-core/error-handling.html#the-default-error-handler) - Handle all other errors and send a 500 error response.
13. [Compression](https://expressjs.com/en/resources/middleware/compression.html) - Apply gzip compression to the response body.
14. Express server sets default headers and sends the [response](https://expressjs.com/en/4x/api.html#res) to the client.

\* For routes registered before the `authenticate` middleware, such as `/health` and `/auth`, this middleware is not invoked.

## Project Structure

- `src/index.js` - Entry point of the application; imports and starts the application.
- `src/cluster.js` - Implements clustering for load balancing across multiple CPU cores.
- `src/app.js` - Configures and initializes the Express application.
- `src/routes/index.js` - Main router that consolidates all route modules.
- `src/routes/*.js` - Individual route modules implementing specific API endpoints.
- `src/middleware/*.js` - Express middleware functions.
- `src/services/*.js` - Houses core business logic separate from the routing layer.
- `src/core/*.js` - Essential to application logic but not business-specific.
- `src/cron/*.js` - Scheduled tasks run at specific intervals.
- `src/scripts/*.js` - Standalone scripts that need to be executed manually.
- `config/*.json` - Hierarchical configuration files.
- `prisma/schema.prisma` - Defines the database schema using Prisma ORM.
- `prisma/seed.js` - Script for seeding initial data into the database.
- `utils/index.js` - Reusable functions that are not tied to business logic.
- `keys/genKeys.sh` - Script for generating JWT keys.
- `.env` - Environment-specific configuration file used for managing secrets and runtime settings.















