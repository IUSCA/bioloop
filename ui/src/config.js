const exports = {
  mode: "development",
  // vite server redirects traffic on URLs starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  googleReturn:
    import.meta.env.VITE_GOOGLE_RETURN || "https://localhost/auth/google",
  cilogonReturn:
    import.meta.env.VITE_CILOGON_RETURN || "https://localhost/auth/cil",
  microsoftReturn:
    import.meta.env.VITE_MICROSOFT_RETURN || "https://localhost/auth/microsoft",
  refreshTokenTMinusSeconds: {
    appToken: 300,
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
    microsoft: true,
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
  enabledFeatures: {
    genomeBrowser: true,
    notifications: {
      enabledForRoles: [],
    },
    import: {
      enabledForRoles: ["admin"],
    },
    downloads: true,
    signup: false,
    uploads: {
      enabledForRoles: ["admin"],
    },
    // Compute and send a BLAKE3 manifest hash before each upload so the
    // verification worker can confirm file integrity end-to-end.
    upload_verify_checksums: true,
    auto_create_project_on_dataset_creation: {
      enabledForRoles: ["user"],
    },
    alerts: false,
  },
  notifications: {
    pollingInterval: 5000, // milliseconds
  },
  alerts: {
    maxDisplayCount: 1, // Maximum number of alerts to display at once
  },
  upload: {
    // Maximum size per individual file (bytes). Must match upload.max_file_size_bytes
    // in the API config. Enforced server-side by TUS; this value is used for
    // client-side validation so users get an immediate error instead of a
    // mid-upload rejection.
    max_file_size_bytes:
      parseInt(import.meta.env.VITE_UPLOAD_MAX_FILE_SIZE_BYTES) || 107374182400, // 100 GB default
  },
};

export default exports;
