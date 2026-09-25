/**
 * Check the user-resource permission middleware without making HTTP requests.
 * The username in `req.params` identifies the account being read, while
 * `req.user` identifies the signed-in requester and their roles.
 */
const { accessControl } = require('../../src/middleware/auth');

const canReadUser = accessControl('user')('read', { checkOwnership: true });

describe('accessControl for reading users', () => {
  it('allows a user to read their own account', async () => {
    const req = {
      user: { username: 'test-user', roles: ['user'] },
      params: { username: 'test-user' },
    };
    const next = jest.fn();

    await canReadUser(req, {}, next);

    expect(req.permission.granted).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a user reading another account', async () => {
    const req = {
      user: { username: 'test-user', roles: ['user'] },
      params: { username: 'other-user' },
    };
    const next = jest.fn();

    await canReadUser(req, {}, next);

    expect(req.permission).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('allows an admin to read another account', async () => {
    const req = {
      user: { username: 'admin-user', roles: ['admin'] },
      params: { username: 'other-user' },
    };
    const next = jest.fn();

    await canReadUser(req, {}, next);

    expect(req.permission.granted).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
