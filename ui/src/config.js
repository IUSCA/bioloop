const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  googleReturn:
    import.meta.env.VITE_GOOGLE_RETURN || "https://localhost/auth/google",
  cilogonReturn:
    import.meta.env.VITE_CILOGON_RETURN || "https://localhost/auth/cil",
  refreshTokenTMinusSeconds: 300,
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
  alertForEnvironments: ["ci"],
  enabledFeatures: {
    genomeBrowser: true,
  },
  dataset_ingestion_source_dir:
    import.meta.env.VITE_DATASET_INGESTION_SOURCE_DIR || "/",
  filesystem_search_spaces:
    import.meta.env.VITE_FILESYSTEM_SEARCH_SPACES || "/bioloop/user",
};

export default exports;
