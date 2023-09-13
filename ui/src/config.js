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
};

export default exports;
