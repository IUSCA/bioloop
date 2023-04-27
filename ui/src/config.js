const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  defaultTitle: "DGL-SCA",
  contact: {
    dgl_admin: "admin@dgl.iu.edu",
    sca_admin: "sca-ops-l@list.iu.edu",
  },
  batch_polling_interval: 10000,
  paths: {
    stage: {
      raw_data: "/N/project/DG_Multiple_Myeloma/share/raw_data",
      data_products: "/N/project/DG_Multiple_Myeloma/share/data_products",
    },
  },
};

export default exports;
