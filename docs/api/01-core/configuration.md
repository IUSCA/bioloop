# Configuration

The configuration system is a critical part of the application, enabling developers to manage environment-specific settings and maintain clean, maintainable code. It uses the [config module](https://github.com/node-config/node-config) to load and manage configuration files, ensuring that the application behaves consistently across different environments.

## Purpose of the Configuration System

The configuration system exists to centralize and standardize the way application settings are managed. Without it, developers would need to hardcode settings or rely on ad-hoc methods to manage environment-specific configurations, leading to brittle and error-prone code.

By using this system:
- Developers can easily override settings for different environments (e.g., development, production).
- Sensitive information, such as API keys and database credentials, can be securely managed using environment variables.
- The application becomes easier to maintain and extend, as configuration logic is decoupled from the application logic.

## How It Fits Into the System

The configuration system integrates seamlessly with the application by:
- Loading settings from JSON files located in the `./config/` directory.
- Allowing overrides via environment variables, command-line arguments, or external sources.
- Providing a consistent API for accessing configuration values throughout the application.

This ensures that all parts of the application use the same source of truth for configuration, reducing duplication and potential inconsistencies.

## Configuration Files

The following configuration files are used:
- `default.json`: Contains default settings for the application.
- `{NODE_ENV}.json` (e.g., `production.json`): Contains environment-specific overrides.
- `custom-environment-variables.json`: Maps configuration properties to environment variables.

### Precedence of Configuration

The configuration system resolves settings in the following order of precedence:
1. Command-line arguments
2. Environment variables
3. `{NODE_ENV}.json` (e.g., `production.json`)
4. `default.json`

This precedence ensures that the most specific settings are applied, while falling back to defaults when necessary.

## Environment Variables

The application uses the `dotenv-safe` module to load environment variables from a `.env` file. This ensures that all required variables are defined and prevents runtime errors caused by missing configurations.

### Example `.env` File

```env
DATABASE_PASSWORD=your_database_password
WORKFLOW_AUTH_TOKEN=your_auth_token
OAUTH_BASE_URL=https://example.com/oauth
```

### Loading Environment Variables

To load environment variables, the following code is used:

```javascript
require('dotenv-safe').config();
```

Ensure that a `.env.example` file exists to document required variables and their expected format.

## Step-by-Step Instructions for Usage

1. **Define Default Settings**:
   Add default settings in `default.json` under the `./config/` directory. For example:
   ```json
   {
     "express": {
       "port": 3030,
       "host": "localhost"
     }
   }
   ```

2. **Add Environment-Specific Overrides**:
   Create a file named `{NODE_ENV}.json` (e.g., `production.json`) and override specific settings:
   ```json
   {
     "express": {
       "port": 8080
     }
   }
   ```

3. **Map Environment Variables**:
   Use `custom-environment-variables.json` to map sensitive settings to environment variables:
   ```json
   {
     "express": {
       "port": "EXPRESS_PORT"
     }
   }
   ```

4. **Create a `.env` File**:
   Define the required environment variables in a `.env` file:
   ```env
   EXPRESS_PORT=3030
   ```

5. **Load Configuration in Code**:
   Access configuration values in your application using the `config` module:
   ```javascript
   require('dotenv-safe').config();
   const config = require('config');
   const port = config.get('express.port');
   console.log(`Server running on port ${port}`);
   ```

foo bar