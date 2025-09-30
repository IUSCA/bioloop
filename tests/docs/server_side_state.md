## Interaction with Server

Following are use-cases where a test may need to talk to the API.

### Using server-side state in test

If a test needs to get/set the server-side state before or after it runs, it can be accomplished by making calls to the API layer.

For making requests to Bioloop's authenticated API routes, the request will need a JWT token embedded in the `Authorization` header. This token can be read from `localStorage` inside a running test.

- Playwright offers an `APIRequestContext` API which can be used to make REST calls.
    - There are wrappers for standard REST API methods within `tests/api/index.js`, which use Playwright's `APIRequestContext` to make API calls. Using these wrappers instead of using `APIRequestContext` directly can make your test code less verbose.
    - You can also wrap these REST-method wrappers further into entity-specific-REST-API invocations.
- Third-party open-source REST-API libraries like Axios can also be used to make REST calls, if desired.

The below example illustrates how to make a REST API call from within a test, using Playwright's `APIRequestContext` API. It is recommended to use the REST-API wrappers from `tests/api/index.js` instead of using `APIRequestContext` directly.

```
test('test that needs to get server-side state', async ({ page }) => {
  ...
  // It's necessary to visit a route in the app first before accessing `localStorage`
  await page.goto('/');
  // retrieve token from local storage
  const token = await page.evaluate(() => localStorage.getItem('token'));
  
  // use retrieved token to make API calls
  const { request } = page;
  const response = await request.get(`${config.apiBasePath}/datasets`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const retrievedDatasets = await response.json();
  ...
})
```
