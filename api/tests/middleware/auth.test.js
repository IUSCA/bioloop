/**
 * Check the API's shared authentication middleware in isolation.
 * Fake Express requests and a mocked `next` show whether a request is rejected
 * with 401 or passed on with `req.user`. The success case uses a real signed JWT;
 * these tests do not perform a browser login or send an HTTP request.
 */
const { authenticate } = require('../../src/middleware/auth');
const { issueJWT } = require('../../src/services/auth');
const logger = require('../../src/services/logger');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('authenticate middleware', () => {
  it('rejects a request without a token', () => {
    const req = { headers: {} };
    const next = jest.fn();

    authenticate(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.user).toBeUndefined();
  });

  it('rejects an invalid token', () => {
    // JWT verification is expected to log this error; keep test output quiet.
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const next = jest.fn();

    authenticate(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(req.user).toBeUndefined();
  });

  it('passes the authenticated user to the next middleware', () => {
    const profile = { username: 'test-user', roles: ['user'] };
    const token = issueJWT({ userProfile: profile });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    authenticate(req, {}, next);

    expect(req.user).toEqual(profile);
    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
