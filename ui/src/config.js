const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  uploadBasePath: "https://bioloop-dev2.sca.iu.edu",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  appTitle: "BIOLOOP",
  contact: {
    app_admin: "admin@sca.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    download: "/N/scratch/bioloop/production/download",
  },
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
};

export default exports;
