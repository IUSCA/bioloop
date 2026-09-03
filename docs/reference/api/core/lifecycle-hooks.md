# Lifecycle Hooks

The lifecycle hooks in this project are designed to manage specific tasks during the application's lifecycle. These hooks ensure that critical operations are performed at the right time, such as during startup, shutdown, or before forking worker processes.

## Location of Lifecycle Hooks

The lifecycle hooks are implemented in the file located at:
```
src/core/lifecycle.js
```

### Etiquette for Editing/Updating Lifecycle Hooks

- **Do not add your function body to `lifecycle.js`.**
- Instead, define new functions or logic in separate files/modules and call them from the respective lifecycle hook in `lifecycle.js`.
- This approach ensures modularity, readability, and easier testing of individual components.

For example:
```javascript
// Define your logic in a separate file
async function customLogic() {
  // ...custom logic...
}

// Call it in the lifecycle hook
async function onApplicationBootstrap() {
  await customLogic();
}
```

## Hooks Overview

### `beforeApplicationFork`
- **Purpose**: Executes tasks that need to run in the master process before forking worker processes.
- **Use Case**: Perform one-time setup tasks such as generating Swagger documentation or registering cron jobs.
- **Error Handling**: Errors in this hook are logged, and the process exits if critical tasks fail.


### `onApplicationBootstrap`
- **Purpose**: Executes tasks during the application bootstrap phase, typically after the application has started.
- **Use Case**: Log warnings or perform checks based on configuration settings.
- **Error Handling**: Errors in this hook are logged, and the process exits if critical tasks fail.


### `beforeApplicationShutdown`
- **Purpose**: Executes tasks in worker processes before the server shuts down.
- **Use Case**: Perform cleanup tasks or prepare the application for shutdown.
- **Error Handling**: Errors are logged, but the shutdown process continues.


### `onApplicationShutdown`
- **Purpose**: Executes tasks in worker processes after the server has shut down.
- **Use Case**: Final cleanup or logging after the application has fully stopped.
- **Error Handling**: Errors are logged, but the process exits regardless.


## Integration

These hooks are used in the application lifecycle to ensure proper initialization and cleanup. For example:
- `beforeApplicationFork` is called in the master process before forking workers.
- `onApplicationBootstrap` is invoked during the startup phase.
- `beforeApplicationShutdown` and `onApplicationShutdown` are used during the shutdown process to handle cleanup tasks.

By leveraging these hooks and following the guidelines for editing them, the application ensures a clean and predictable lifecycle management process.

