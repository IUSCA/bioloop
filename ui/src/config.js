const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  appTitle: "CfN-DAP",
  contact: {
    app_admin: "admin@sca.iu.edu",
    sca_admin: "sca-ops-l@list.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    stage: {
      RAW_DATA: "/N/scratch/radyuser/cfndap/production/stage/raw_data",
      DATA_PRODUCT: "/N/scratch/radyuser/cfndap/production/stage/data_products",
    },
    download: "/N/scratch/radyuser/cfndap/production/download",
  },
  file_browser: {
    enable_downloads: false,
    cache_busting_id: "fe09b01", // any random string different from the previous value will work
  },
};

export default exports;
