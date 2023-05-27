const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  appTitle: "DGL-SCA",
  contact: {
    app_admin: "admin@dgl.iu.edu",
    sca_admin: "sca-ops-l@list.iu.edu",
  },
  dataset_polling_interval: 10000,
  paths: {
    stage: {
      RAW_DATA: "/N/project/DG_Multiple_Myeloma/share/raw_data",
      DATA_PRODUCT: "/N/scratch/dgluser/dgl/production/stage/data_products",
    },
  },
};

export default exports;
