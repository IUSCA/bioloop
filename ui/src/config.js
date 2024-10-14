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
  globus: {
    auth_url:
      import.meta.env.VITE_GLOBUS_OAUTH_AUTH_URL ||
      "https://localhost/globus/authorize",
    token_url:
      import.meta.env.VITE_GLOBUS_OAUTH_TOKEN_URL ||
      "https://localhost/globus/token",
    client_id: import.meta.env.VITE_GLOBUS_OAUTH_CLIENT_ID || "client_id",
    client_secret:
      import.meta.env.VITE_GLOBUS_OAUTH_CLIENT_SECRET || "client_secret",
    scopes: import.meta.env.VITE_GLOBUS_OAUTH_SCOPES || "scopes",
    redirect_uri:
      import.meta.env.VITE_GLOBUS_OAUTH_REDIRECT_URI ||
      "https://localhost/globus/post-login-redirect",
  },
};

export default exports;
