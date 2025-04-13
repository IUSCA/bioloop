# API Documentation

## Overview

The Bioloop API is a RESTful service built with Express.js that provides endpoints for data management, user authentication, and task processing. This guide covers setup, authentication, endpoints, and best practices.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Authorization](#authorization-role-based-access-control)
4. [Error Handling](#error-handling)
5. [Request Flow](#request-flow)
6. [Project Structure](#project-structure)
7. [Configuration](#config)
8. [Development](#development)

## Getting Started

1. Set up environment configuration:
```bash
cp .env.example .env
```

2. Configure required environment variables:
```env
NODE_ENV=development|docker|production
DATABASE_PASSWORD=your_password
DATABASE_URL=postgresql://user:pass@host:5432/db
```

## Running the API

### Using Docker (Recommended)
```bash
# Start API and database
docker compose up postgres api -d

# Environment settings
NODE_ENV=docker
DATABASE_URL="postgresql://appuser:example@postgres:5432/app?schema=public"
```

### Local Development
```bash
# Start local Postgres
# Create database and user
createdb app
createuser -P appuser  # Set password to 'example'
psql -d app -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO appuser;"

# Environment settings
NODE_ENV=default
DATABASE_URL="postgresql://appuser:example@localhost:5432/app?schema=public"

# Install dependencies and start
pnpm install
pnpm start
```

## Core Features

- **Authentication & Authorization**
  - IU CAS authentication
  - JWT-based session management
  - Role-based access control (RBAC)
  
- **Data Handling**
  - Request validation
  - Query/body parsing
  - Response compression
  - CORS support
  
- **Database**
  - Prisma ORM
  - PostgreSQL support
  - Migration management
  
- **Development**
  - Auto-generated Swagger docs
  - Comprehensive logging
  - Request validation
  - Error handling

## Development Features

- Hot reload with Nodemon
- ESLint configuration
- EditorConfig for consistent styling
- PM2 for production process management
- Docker support

Note: The API assumes a reverse proxy handles security headers (no Helmet module)

## Request Flow

Each API request goes through the following middleware pipeline:

1. **Request Creation**
   - Express creates request object with query string, parameters, body, headers
   - [Express Request Docs](https://expressjs.com/en/4x/api.html#req)

2. **Request Processing** ([app.js](src/app.js))
   - Parse body, query parameters, cookies
   - Handle CORS
   - Initial routing

3. **Authentication**
   - Validate JWT token
   - Attach user profile to `req.user`
   - Return 401 if unauthorized

4. **Authorization**
   - Check user permissions
   - Attach permission object to `req.permission`
   - Return 403 if forbidden

5. **Validation**
   - Validate request parameters
   - Return 400 if invalid

6. **Business Logic**
   - Execute route handler
   - Generate response

7. **Response Processing**
   - Apply gzip compression
   - Set response headers
   - Send response to client

### Error Handling Flow

When errors occur, the following handlers process them in order:

1. **404 Handler**
   - Catches routing failures
   - Returns 404 response

2. **Prisma Not Found Handler**
   - Catches Prisma record not found errors
   - Returns 404 response

3. **Global Error Handler**
   - Catches all other errors
   - Returns appropriate error response (usually 500)
   - Applies compression
   - Sets response headers

Note: Some routes (e.g., `/health`, `/auth`) bypass authentication

## Project Structure

```
src/
├── index.js           # Application entry point
├── app.js            # Express app configuration
├── routes/           # Route definitions
│   ├── index.js      # Main router
│   └── *.js         # Feature-specific routes
├── middleware/       # Express middleware
├── services/        # Business logic
│   └── logger.js    # Winston logger
├── config/          # Configuration files
└── utils/           # Helper functions

prisma/
├── schema.prisma    # Database schema
└── seed.js         # Database seeding
```

## Error Handling

The API implements a comprehensive error handling system based on [Express Error Handling](https://expressjs.com/en/guide/error-handling.html).

### Key Concepts

- Express auto-handles synchronous errors
- Async errors require explicit handling
- Calling `next(err)` triggers error middleware
- Error handlers receive `(err, req, res, next)`

### Async Error Handling

The `asyncHandler` middleware simplifies async error handling:

```javascript
// Good - Using asyncHandler
router.get('/user', asyncHandler(async (req, res) => {
    const user = await userService.findActiveUserBy('username', req.query.username);
    res.json(user);
}));

// Bad - Manual try/catch
router.get('/user', async (req, res, next) => {
    try {
        const user = await userService.findActiveUserBy('username', req.query.username);
        res.json(user);
    } catch(err) {
        next(err);
    }
});
```


### Error Handler Types

1. **Default Handler**
   - Sets status code from `err.status`
   - Sets appropriate status message
   - Returns stack trace in development
   - Returns generic message in production

2. **Custom Handler**
   - Logs errors appropriately
   - Exposes safe error messages
   - Handles HTTP-specific errors
   - Manages 4xx vs 5xx errors

3. **Prisma Handler**
   - Converts Prisma errors to HTTP responses
   - Handles "not found" cases
   - Maps database errors to appropriate status codes

### Error Response Examples

```javascript
// 400 Bad Request
throw createError(400, 'Invalid input');
// Response: { "message": "Invalid input" }

// 404 Not Found
throw createError.NotFound();
// Response: { "message": "Not Found" }

// 500 Internal Error
throw new Error('Database connection failed');
// Response: { "message": "Internal Server Error" }
```

### Using HTTP Errors

The `http-errors` module provides a clean API for error creation:

```javascript
// Using status code
const err = createError(404, 'User not found');
next(err);

// Using named constructor
next(createError.NotFound('User not found'));

// With custom options
next(createError(502, 'Gateway error', { expose: true }));
```

See [http-errors documentation](https://github.com/jshttp/http-errors) for more constructors.


### Prisma Error Handling

The API includes middleware to handle Prisma-specific errors:

```javascript
// Before - Manual Prisma error handling
router.delete('/:username', asyncHandler(async (req, res, next) => {
    try {
        const user = await userService.softDeleteUser(req.params.username);
        res.json(user);
    } catch(e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && 
            e?.meta?.cause?.includes('not found')) {
            return next(createError.NotFound());
        }
        return next(e);
    }
}));

// After - Using prismaNotFoundHandler middleware
router.delete('/:username', asyncHandler(async (req, res) => {
    const user = await userService.softDeleteUser(req.params.username);
    res.json(user);
}));
```

The `prismaNotFoundHandler` middleware automatically converts Prisma "not found" errors to HTTP 404 responses.


## Configuration

The API uses [node-config](https://github.com/node-config/node-config) for configuration management:

### Configuration Files
```
config/
├── default.json           # Default settings
├── production.json        # Production overrides
└── custom-environment-variables.json  # ENV mapping
```

### Configuration Priority
1. Command line arguments
2. Environment variables
3. {NODE_ENV}.json
4. default.json

### Environment Variables
```javascript
// Load .env file
require('dotenv-safe').config();
```

See the [node-config documentation](https://github.com/node-config/node-config/wiki) for more details.

## Authentication

The API implements IU CAS authentication with JWT session management.

### Authentication Flow
![Auth Flow](../public/api_auth.png)

### Implementation

1. **Protected Routes**
   - All routes after `authenticate` middleware require authentication
   - Public routes (e.g., `/health`, `/auth`) are registered first

2. **JWT Verification**
   - Extracts bearer token from Authorization header
   - Verifies token cryptographically
   - Attaches user data to `req.user`

### Usage Example
```javascript
const { authenticate } = require('../middleware/auth');

// Protect single route
router.post('/refresh_token', 
    authenticate, 
    asyncHandler(async (req, res) => {
        const user = await userService.findActiveUserBy('username', req.user.username);
        // Handle token refresh
    })
);

// Protect all routes in a router
router.use(authenticate);
router.get('/profile', ...);
router.put('/settings', ...);
```

## Request Validation

The API uses [express-validator](https://express-validator.github.io/docs/) for request validation.

### Benefits
- Declarative validation rules
- Reduces boilerplate validation code
- Consistent error handling
- Type coercion and sanitization

### Example Usage

```javascript
const validate = require('middleware/validators')

// Route with validation
app.post('/user',
    validate([
        body('username').isEmail(),
        body('password').isLength({ min: 5 }),
        body('role').isIn(['user', 'admin']),
    ]),
    asyncHandler(async (req, res) => {
        const user = await User.create(req.body);
        res.json(user);
    })
);

// Validation error response
{
    "errors": [
        {
            "msg": "Invalid email",
            "param": "username",
            "location": "body"
        }
    ]
}
```

## Role-Based Access Control

The API implements RBAC using the [accesscontrol](https://www.npmjs.com/package/accesscontrol) library.

### Roles
- user: Basic access
- operator: Enhanced access
- admin: Administrative access
- superadmin: Full system access

### Permission Scopes
- own: Access to user's own resources
- any: Access to any user's resources

### Example: User Profile Access

```javascript
// Permission configuration
const permissions = {
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
};

// Route implementation
const isPermittedTo = accessControl('user');

router.get('/:username',
    authenticate,
    isPermittedTo('read', { checkOwnerShip: true }),
    asyncHandler(async (req, res) => {
        const user = await userService.findActiveUserBy('username', req.params.username);
        res.json(user);
    })
);
```

This ensures:
- Admins can access any user profile
- Users can only access their own profile
- Unauthorized access returns 403

## API Documentation

The API uses Swagger for automatic documentation generation.

### Setup
1. Add swagger tags to routes:
```javascript
// #swagger.tags = ['Users']
router.get('/users', ...);
```

2. Generate documentation:
```bash
npm run swagger-autogen
```

3. View documentation:
```
http://<api-host>:<api-port>/docs
```

### Files
- `swagger.js`: Configuration and generation script
- `swagger_output.json`: Generated API documentation

For more details, see [Swagger Auto-Gen Guide](https://medium.com/swlh/automatic-api-documentation-in-node-js-using-swagger-dd1ab3c78284)
