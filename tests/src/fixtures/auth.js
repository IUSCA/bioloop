/* eslint-disable import/prefer-default-export */
import { request as baseRequest } from '@playwright/test';
import config from 'config';

/**
 * Get a token for a user with a given role
 */
async function getTokenByRole({ role }) {
  const apiContext = await baseRequest.newContext({
    baseURL: config.apiBaseURL,
    ignoreHTTPSErrors: true,
  });
  const res = await apiContext.post('/auth/cas/verify', {
    data: { ticket: role },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Unable to retrieve token for role ${role}. Response: ${body}`);
  }
  const body = await res.json();
  return body.token;
}

export { getTokenByRole };
