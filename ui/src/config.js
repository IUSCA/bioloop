const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  uploadApiBasePath:
    import.meta.env.VITE_UPLOAD_API_BASE_PATH || "https://localhost",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  googleReturn:
    import.meta.env.VITE_GOOGLE_RETURN || "https://localhost/auth/google",
  cilogonReturn:
    import.meta.env.VITE_CILOGON_RETURN || "https://localhost/auth/cil",
  refreshTokenTMinusSeconds: {
    appToken: 300,
    uploadToken: 25,
  },
  analyticsId: "G-FOO",
  appTitle: "BIOLOOP",
  contact: {
    app_admin: "bioloop-ops-l@list.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    download: "",
  },
  file_browser: {
    enable_downloads: true,
    cache_busting_id: "fe09b01", // any random string different from the previous value will work
  },
  enable_delete_archive: true,
  dataset: {
    types: {
      RAW_DATA: {
        key: "RAW_DATA",
        label: "Raw Data",
        collection_path: "rawdata",
        icon: "mdi-dna",
      },
      DATA_PRODUCT: {
        key: "DATA_PRODUCT",
        label: "Data Product",
        collection_path: "dataproducts",
        icon: "mdi-package-variant-closed",
      },
    },
  },
  download_types: {
    SLATE_SCRATCH: "SLATE_SCRATCH",
    BROWSER: "BROWSER",
  },
  metric_measurements: {
    SDA: "sda",
    SLATE_SCRATCH: "/N/scratch",
    SLATE_SCRATCH_FILES: "/N/scratch files",
  },
  auth_enabled: {
    google: true,
    cilogon: true,
  },
  dashboard: {
    active_tasks: {
      steps: [
        "await stability",
        "inspect",
        "archive",
        "stage",
        "validate",
        "setup download",
        "delete source",
      ],
      refresh_interval_ms: 10000,
    },
  },
  alertForEnvironments: ["ci"],
  DATASET_STATES: {
    REGISTERED: "REGISTERED",
    READY: "READY",
    INSPECTED: "INSPECTED",
    ARCHIVED: "ARCHIVED",
    FETCHED: "FETCHED",
    STAGED: "STAGED",
    DUPLICATE_REGISTERED: "DUPLICATE_REGISTERED",
    DUPLICATE_READY: "DUPLICATE_READY",
    DUPLICATE_REJECTED: "DUPLICATE_REJECTED",
    OVERWRITTEN: "OVERWRITTEN",
    DELETED: "DELETED",
  },
  enabledFeatures: {
    genomeBrowser: true,
  },
  // filesystem_scratch_source_dir:
  //   import.meta.env.VITE_DATASET_INGESTION_SOURCE_DIR || "/",
  upload_status: {
    UPLOADING: "UPLOADING",
    UPLOAD_FAILED: "UPLOAD_FAILED",
    UPLOADED: "UPLOADED",
    PROCESSING: "PROCESSING",
    PROCESSING_FAILED: "PROCESSING_FAILED",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
  },
  SUBMISSION_STATES: {
    UNINITIATED: "Uninitiated",
    PROCESSING: "Processing",
    PROCESSING_FAILED: "Processing Failed",
    UPLOADING: "Uploading",
    UPLOAD_FAILED: "Upload Failed",
    UPLOADED: "Uploaded",
  },
  featureFlags: {
    notifications: {
      enabledForRoles: [],
    },
  },
  notifications: {
    pollingInterval: 5000, // milliseconds
  },
  filesystem_search_spaces: [
    {
      [import.meta.env.VITE_SCRATCH_BASE_DIR]: {
        base_path:
          import.meta.env.VITE_SCRATCH_BASE_DIR || "/bioloop/scratch/space",
        mount_path:
          import.meta.env.VITE_SCRATCH_MOUNT_DIR ||
          "/bioloop/user/scratch/mount/dir",
        label: "Slate-Scratch",
      },
    },
    {
      [import.meta.env.VITE_PROJECT_BASE_DIR]: {
        base_path:
          import.meta.env.VITE_PROJECT_BASE_DIR || "/bioloop/project/space",
        mount_path:
          import.meta.env.VITE_PROJECT_MOUNT_DIR ||
          "bioloop/user/project/mount/dir",
        label: "Slate-Project",
      },
    },
  ],
  restricted_ingestion_dirs: [
    import.meta.env.VITE_SCRATCH_INGESTION_RESTRICTED_DIRS ||
      "/scratch/space/restricted",
    import.meta.env.VITE_PROJECT_INGESTION_RESTRICTED_DIRS ||
      "/project/space/restricted",
  ],
  globus: {
    auth_url:
      import.meta.env.VITE_GLOBUS_OAUTH_AUTH_URL ||
      "https://localhost/globus/authorize",
    client_id: import.meta.env.VITE_GLOBUS_OAUTH_CLIENT_ID || "client_id",
    scopes: import.meta.env.VITE_GLOBUS_OAUTH_SCOPES || "scopes",
    redirect_uri:
      import.meta.env.VITE_GLOBUS_OAUTH_REDIRECT_URI ||
      "https://localhost/globus/post-login-redirect",
    transfer_endpoint_url:
      import.meta.env.VITE_GLOBUS_TRANSFER_ENDPOINT_URL ||
      "https://localhost/globus/transfer",
    source_endpoint_id:
      import.meta.env.VITE_GLOBUS_SOURCE_ENDPOINT_ID || "source_endpoint_uuid",
    destination_endpoint_id:
      import.meta.env.VITE_GLOBUS_DESTINATION_ENDPOINT_ID ||
      "destination_endpoint_uuid",
    source_endpoint_path:
      import.meta.env.VITE_GLOBUS_SOURCE_ENDPOINT_PATH || "/path",
    destination_endpoint_path:
      import.meta.env.VITE_GLOBUS_DESTINATION_ENDPOINT_PATH || "/path",
  },
};

export default exports;
