const exports = {
  mode: "development",
  // vite server redirects traffic on starting with apiBaseURL
  // to http://${config.apiHost}:${config.apiPort} in dev environment
  apiBasePath: "/api",
  casUrl: "https://idp-stg.login.iu.edu/idp/profile/cas/login",
  casReturn: "https://localhost/signin",
  defaultRedirect: "/signin",
  analyticsId: "G-FOO",
};

export default exports;
