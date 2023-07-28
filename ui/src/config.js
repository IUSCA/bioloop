const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth/iucas",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  appTitle: "CPA-SCA",
  contact: {
    app_admin: "admin@sca.iu.edu",
    sca_admin: "sca-ops-l@list.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    stage: {
      RAW_DATA: "/N/scratch/cpauser/cpa/production/stage/raw_data",
      DATA_PRODUCT: "/N/scratch/cpauser/cpa/production/stage/data_products",
    },
    download: "/N/scratch/cpauser/cpa/production/download",
  },
};

export default exports;
