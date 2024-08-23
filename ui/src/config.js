const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  uploadApiBasePath: "https://bioloop-dev2.sca.iu.edu",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  googleReturn:
    import.meta.env.VITE_GOOGLE_RETURN || "https://localhost/auth/google",
  cilogonReturn:
    import.meta.env.VITE_CILOGON_RETURN || "https://localhost/auth/cil",
  refreshTokenTMinusSeconds: {
    appToken: 300,
    uploadToken: 5,
  },
  // refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  appTitle: "BIOLOOP",
  contact: {
    app_admin: "bioloop-ops-l@list.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    download: "/N/scratch/bioloop/production/download",
  },
  slateScratchPath: "https://bioloop-dev2.sca.iu.edu",
  file_browser: {
    enable_downloads: true,
    cache_busting_id: "fe09b01", // any random string different from the previous value will work
  },
  enable_delete_archive: true,
  dataset: {
    types: {
      RAW_DATA: {
        label: "Raw Data",
        collection_path: "rawdata",
        icon: "mdi-dna",
      },
      DATA_PRODUCT: {
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
  upload_status: {
    UPLOADING: "UPLOADING",
    UPLOAD_FAILED: "UPLOAD_FAILED",
    UPLOADED: "UPLOADED",
    PROCESSING: "PROCESSING",
    PROCESSING_FAILED: "PROCESSING_FAILED",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
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
  SUBMISSION_STATES: {
    UNINITIATED: "Uninitiated",
    PROCESSING: "Processing",
    PROCESSING_FAILED: "Processing Failed",
    UPLOADING: "Uploading",
    UPLOAD_FAILED: "Upload Failed",
    UPLOADED: "Uploaded",
  },
};

export default exports;
