import { request as baseRequest } from '@playwright/test';
import config from 'config';

/**
 * Get a token for a user with a given role.
 *
 * Uses string concatenation rather than Playwright's URL resolution because
 * Playwright strips the path component of baseURL when the provided URL starts
 * with "/".  E.g. baseURL="https://localhost:24443/api" + "/auth/cas/verify"
 * resolves to "https://localhost:24443/auth/cas/verify" (wrong) instead of
 * "https://localhost:24443/api/auth/cas/verify" (correct).
 *
 * ignoreHTTPSErrors is required when the Vite dev server uses a self-signed cert.
 */
async function getTokenByRole({ role }) {
  const apiContext = await baseRequest.newContext({
    ignoreHTTPSErrors: true,
  });
  const res = await apiContext.post(`${config.apiBaseURL}/auth/cas/verify`, {
    data: { ticket: role },
  });
  const body = await res.json();
  return body.token;
}

export { getTokenByRole };
