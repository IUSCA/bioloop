import { request as baseRequest } from '@playwright/test';
import config from 'config';

/**
 * Get a token for a user with a given role
 */
async function getToken({ role }) {
  const apiContext = await baseRequest.newContext({
    baseURL: config.apiBaseURL,
  });
  const res = await apiContext.post('/auth/cas/verify', {
    data: { ticket: role },
  });
  const body = await res.json();
  return body.token;
}

export { getToken };
