# DGL-API

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
DATABASE_URL="postgresql://dgluser:example@dgl_postgres:5432/dgl?schema=public"
```
From the project root run: `docker compose up postgres api -d` to start both the API server and the database

### Running on host machine

Start a postgres db server on localhost and create a database `dgl` and user `dgluser` (password: `example`) with write premissions to public schema. In this local environment, the content of `.env` file is:

```bash
NODE_ENV=default
DATABASE_PASSWORD='example'
DATABASE_URL="postgresql://dgluser:example@localhost:5432/dgl?schema=public"
```

Run `pnpm install` and `pnpm start` to start the API server.

## Features:
- global error handler
- async error handler
- body parser, cookie parser, compression
- logger
  - log incoming requests
  - multi-level logger: ex: `logger.info()`
  - log timestamps
- hierarchical configuration

Developer Exprience
- Auto reload:  `nodemon index.js`
- Linting
    - auto highligt linting errors
    - format on save
- Consistent Coding styles with editorconfig

Production deployment:
- pm2
- redirect logs and rotate log files

Assumptions:
- there is a reverse proxy which handles security headers as we are not using `helmet` module.

## Project Structure
files 
- `index.js` - import app and start
- `app.js` - create and configure express application
- `routes/index.js` - main router
- `routes/*.js` - modular routes
- `middleware/*.js` - express middleware functions
- `services/*.js` - common code specific to this project seperated by usage in router
- `services/logger.js` - winston logger
- `config/*.json` - hierarchical configuration
- `prisma/schema.prisma` - Data definitions
- `prisma/seed.js` - code to initialize tables with some data
- `utils/index.js` - non-specific common code

## Error Handling
Source:
- https://expressjs.com/en/guide/error-handling.html
- https://github.com/jshttp/http-errors

```bash
pnpm install http-error
```

- Express automatically handles errors thrown in the synchronous code, however it cannot catch errors thrown from asynchronous code (in versions below 5). These have to caught and passed to the `next` function.
- The error thrown from the sync code are handled and passed to `next`
- When `next` is called with any argument except `'route'`, express assumes it is due to an error and skips any remaining non-error handling routing and middleware functions.

The default error handler:
- The default error handler is added at the end of the middleware function stack
- The `res.statusCode` is set from `err.status` (or `err.statusCode`). If this value is outside the 4xx or 5xx range, it will be set to 500.
- The `res.statusMessage` is set according to the status code.
- The body will be the HTML of the status code message when in production environment, otherwise will be `err.stack`. (environment variable NODE_ENV=production)
- Any headers specified in an `err.headers` object.

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

### Custom error handler
- `errorHandler` in [middleware/error.js](middleware/error.js)
- Logs error to console
- send actual message to client only if `err.expose` is true otherwise send a generic Internal server error.  For http errors such as (`throw createError(400, 'foo bar')`), the client receives `{"message":"foo bar"}` with status code to 400.
- For non http errors such as  `throw new Error('business logic error')`, only the `err.message` is set others are not. For such error, this handler will send a generic message. Client's will not see `business logic error` in thier response object.
- Does not log to console for 404 errors

### 404 handler
- `notFound` in [middleware/error.js](middleware/error.js)

## Linting

Eslint rules inherited from `eslint-config-airbnb-base`

## Config

Uses config module - https://github.com/node-config/node-config

Configurations are stored in [configuration files](https://github.com/node-config/node-config/wiki/Configuration-Files) within your application, and can be overridden and extended by [environment variables](https://github.com/lorenwest/node-config/wiki/Environment-Variables), [command line parameters](https://github.com/node-config/node-config/wiki/Command-Line-Overrides), or [external sources](https://github.com/lorenwest/node-config/wiki/Configuring-from-an-External-Source).

config files: `default.json`, `production.json`, `custom-environment-variables.json` in `./config/` directory.

precdence of config: command line > environment > {NODE_ENV}.json > default.json

The properties to read and override from environment is defined in `custom-environment-variables.json`

## Authentication

The API uses IU CAS authnetication model. 

see [middleware/auth.js](middleware/auth.js) and [routes/auth.js](routes/auth.js)
