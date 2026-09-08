## OpenAPI Documentation

Auto-generated OpenAPI documentation for the API routes.

1. Add `// #swagger.tags = ['<sub-router>']` comment to the code of the route handler and replace `sub-router` with a valid name that describes the family of routes (ex: User, Dataset, etc).
2. Run `npm run swagger-autogen` to generate the documentation.
3. Visit `http://<api-host>:<api-port>/docs`

Files:
- `swagger.js` - script that generates the documentation. Configures the output file, the router to generate routes and other common config.
- `swagger_output.json` - generated routes, not included in the version control.

Source: https://medium.com/swlh/automatic-api-documentation-in-node-js-using-swagger-dd1ab3c78284