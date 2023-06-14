const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  appTitle: "BIOLOOP",
  contact: {
    app_admin: "admin@sca.iu.edu",
    sca_admin: "sca-ops-l@list.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    stage: {
      RAW_DATA: "/path/to/staged/raw_data",
      DATA_PRODUCT: "/path/to/staged/data_products",
    },
  },
};

export default exports;
