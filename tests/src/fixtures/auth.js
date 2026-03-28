/* eslint-disable import/prefer-default-export */
import { request as baseRequest } from '@playwright/test';
import config from 'config';

/**
 * Get a token for a user with a given role
 */
async function getTokenByRole({ role }) {
  let lastStatus = null;
  let lastBody = '';
  const baseUrls = [config.apiBaseURL, config.baseURL]
    .filter((url, idx, arr) => typeof url === 'string' && url && arr.indexOf(url) === idx);
  const candidatePaths = ['/auth/cas/verify', '/api/auth/cas/verify'];

  for (const baseURL of baseUrls) {
    for (const verifyPath of candidatePaths) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const apiContext = await baseRequest.newContext({
          baseURL,
          ignoreHTTPSErrors: true,
        });
        const res = await apiContext.post(verifyPath, {
          data: { ticket: role },
        });
        if (res.ok()) {
          const body = await res.json();
          return body.token;
        }
        lastStatus = res.status();
        lastBody = await res.text();
        if (attempt < 5) {
          // Short backoff smooths transient startup races in containerized e2e.
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }
  }

  throw new Error(
    `Unable to retrieve token for role ${role}. Status: ${lastStatus}. Response: ${lastBody}`,
  );
}

export { getTokenByRole };
