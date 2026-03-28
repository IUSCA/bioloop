/* eslint-disable import/prefer-default-export */
import { request as baseRequest } from '@playwright/test';
import config from 'config';

/**
 * Resolve a JWT for an e2e role ticket (`admin`, `operator`, `user`).
 *
 * Why this helper is intentionally defensive:
 * - Dockerized e2e can route auth requests through either:
 *   - the API origin directly (`apiBaseURL`), or
 *   - the UI ingress (`baseURL`) with `/api` proxying.
 * - Different local/container startup states can expose CAS verify under
 *   `/auth/cas/verify` or `/api/auth/cas/verify` depending on which origin
 *   the request is sent to.
 * - During stack startup, auth endpoints may briefly return non-200 responses
 *   even though the service becomes healthy moments later.
 *
 * To keep tests deterministic, we:
 * 1) try both configured origins,
 * 2) try both verify paths, and
 * 3) retry each combination with short backoff.
 *
 * This prevents transient boot/proxy races from causing false-negative test
 * failures while still surfacing a clear error if auth truly fails.
 *
 * @param {{ role: 'admin' | 'operator' | 'user' }} params
 * @returns {Promise<string>} JWT token
 * @throws {Error} when all origin/path/retry attempts fail
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
