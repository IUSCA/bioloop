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
  microsoftReturn:
    import.meta.env.VITE_MICROSOFT_RETURN || "https://localhost/auth/microsoft",
  refreshTokenTMinusSeconds: {
    appToken: 300,
    uploadToken: 5,
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
    ingestion: {
      enabledForRoles: ["admin"],
    },
    downloads: true,
    uploads: { enabledForRoles: ["admin"] },
  },
  notifications: {
    pollingInterval: 5000, // milliseconds
  },
  filesystem_search_spaces: [
    {
      slateScratch: {
        base_path:
          import.meta.env.VITE_SCRATCH_BASE_DIR || "/bioloop/scratch/space",
        mount_path:
          import.meta.env.VITE_SCRATCH_MOUNT_DIR ||
          "/bioloop/user/scratch/mount/dir",
        key: "slateScratch",
        label: "Slate-Scratch",
      },
    },
  ],
  restricted_ingestion_dirs: {
    slateScratch: {
      paths:
        import.meta.env.VITE_SCRATCH_INGESTION_RESTRICTED_DIRS ||
        "/scratch/space/restricted",
      key: "scratch",
    },
  },
  upload: {
    scope_prefix: "upload_file:",
    types: { DATASET: "DATASET" },
    status: {
      UPLOADING: "UPLOADING",
      UPLOAD_FAILED: "UPLOAD_FAILED",
      UPLOADED: "UPLOADED",
      PROCESSING: "PROCESSING",
      PROCESSING_FAILED: "PROCESSING_FAILED",
      COMPUTING_CHECKSUMS: "COMPUTING_CHECKSUMS",
      CHECKSUM_COMPUTATION_FAILED: "CHECKSUM_COMPUTATION_FAILED",
      COMPLETE: "COMPLETE",
      FAILED: "FAILED",
    },
  },
};

export default exports;
