const exports = {
  mode: "development",
  apiHost: "dgl_api",
  apiPort: 3030,
  api: "https://localhost/api", // vite redirects traffic on this to http://${config.apiHost}:${config.apiPort}
  casUrl: "https://idp-stg.login.iu.edu/idp/profile/cas/login",
  casReturn: "https://localhost/signin",
  defaultRedirect: "/signin",
  analyticsId: "G-FOO",
};

export default exports;
