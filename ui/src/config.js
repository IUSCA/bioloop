const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casReturn: import.meta.env.VITE_CAS_RETURN || "https://localhost/auth",
  refreshTokenTMinusSeconds: 300,
  analyticsId: "G-FOO",
  defaultTitle: "DGL-SCA",
};

export default exports;
