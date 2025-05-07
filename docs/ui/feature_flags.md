# Feature Flags

- Feature flags for various features in the application.
- Used to enable or disable features based on the roles and permissions of the user.

## Example usage:

```javascript
enabledFeatures: {
  genomeBrowser: true,
  notifications: {
    enabledForRoles: ["admin"]
  },
  ingestion: {
    enabledForRoles: ["admin"]
  },
  downloads: true,
  uploads: {
    enabledForRoles: ["admin"]
  }
}
```

In this example, the genomeBrowser feature is enabled for all users.
The notifications feature is enabled for admin users only.
The ingestion feature is enabled for admin users only.
The downloads feature is enabled for all users.
The uploads feature is enabled for admin users only.
