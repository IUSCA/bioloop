import { request as baseRequest } from '@playwright/test';
import config from 'config';

/**
 * Get a token for a user with a given role
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
