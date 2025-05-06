/* eslint-disable no-console */
const { request, getAuthRequest } = require('../../request');
const { issueToken, issueSignupToken } = require('../../../src/services/auth');
const nonceSerive = require('../../../src/services/nonce');

let authRequest;
const prefix = 'test';

beforeAll(async () => {
  authRequest = await getAuthRequest();
});

describe('POST /auth/signup', () => {
  it('should respond with 401 unauthorized without token', async () => {
    const response = await request.post('/auth/signup').send();

    expect(response.status).toBe(401);
  });

  it('should respond with 401 unauthorized when using expired token', async () => {
    // create a toke with short expiration

    const expired_token = issueToken({
      iss: 'http://localhost',
      exp: (Date.now() + 0) / 1000,
      sub: 'test-email',
      scope: 'test-scope',
      nonce: 'test-nonce',
    });

    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${expired_token}`)
      .send();
    expect(response.status).toBe(401);
  });

  it('should respond with 401 unauthorized when using token with invalid scope', async () => {
    const invalid_scope_token = issueToken({
      iss: 'http://localhost',
      exp: (Date.now() + 3600) / 1000,
      sub: 'test-email',
      scope: 'invalid-scope',
      nonce: 'test-nonce',
    });

    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${invalid_scope_token}`)
      .send();
    expect(response.status).toBe(401);
  });

  it('should create user', async () => {
    const email = `${prefix}_user_${Date.now()}@example.com`;
    const username = `${prefix}-newuser${Date.now()}`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username,
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: 1,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    try {
      expect(response.status).toBe(200);
    } catch (error) {
      console.error('Test failed. Response body:', response.body);
      throw error;
    }
    expect(response.body.status).toBe('success');

    // cleanup: delete created user
    const deleteResponse = await request
      .delete(`/users/${response.body.profile.username}?hard_delete=true`)
      .set('Authorization', `Bearer ${response.body.token}`);
    expect(deleteResponse.status).toBe(200);
  });

  it('should return 401 when email in body is not same as email in token', async () => {
    const token = issueSignupToken({
      email: 'user2@example.com',
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email: 'user@example.com',
      username: 'newuser',
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Signup failed');
  });

  it('should prevent replay attacks', async () => {
    const email = `${prefix}_user_${Date.now()}@example.com`;
    const username = `${prefix}-newuser${Date.now()}`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username,
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response.status).toBe(200);

    // use the same token again
    const response2 = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response2.status).toBe(401);
    expect(response2.body.message).toBe('Signup failed');

    // cleanup: delete created user
    const deleteResponse = await authRequest
      .delete(`/users/${response.body.profile.username}?hard_delete=true`);
    expect(deleteResponse.status).toBe(200);
  });

  it('should create a unique username', async () => {
    // create a user
    const email = `${prefix}_user_${Date.now()}@example.com`;
    const username = `${prefix}-newuser${Date.now()}`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username,
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response.status).toBe(200);

    // create another user with the same username
    const email2 = `${prefix}_user2_${Date.now()}@example.com`;
    const token2 = issueSignupToken({
      email: email2,
      nonce: await nonceSerive.createNonce(),
    });
    const userData2 = {
      email: email2,
      username,
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };
    const response2 = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token2}`)
      .send(userData2);
    expect(response2.status).toBe(200);
    const { profile } = response2.body;
    expect(profile.username).toBe(`${username}1`);

    // clean up: delete first user
    const deleteResponse = await authRequest
      .delete(`/users/${response.body.profile.username}?hard_delete=true`);
    expect(deleteResponse.status).toBe(200);

    // clean up: delete second user
    const deleteResponse2 = await authRequest
      .delete(`/users/${response2.body.profile.username}?hard_delete=true`);
    expect(deleteResponse2.status).toBe(200);
  });

  it('should return 401 when terms are not agreed', async () => {
    const email = `user${Date.now()}@example.com`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username: 'newuser',
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: false,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('User did not agree to terms');
  });

  it('should return 400 for duplicate email', async () => {
    const email = `user${Date.now()}@example.com`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username: 'newuser',
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response.status).toBe(200);

    const token2 = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const response2 = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token2}`)
      .send(userData);
    expect(response2.status).toBe(400);

    // cleanup: delete created user
    const deleteResponse = await authRequest
      .delete(`/users/${response.body.profile.username}?hard_delete=true`);
    expect(deleteResponse.status).toBe(200);
  });

  it('should treat usernames as case-insensitive', async () => {
    const email = `${prefix}_user_${Date.now()}@example.com`;
    const username = `${prefix}-NewUser${Date.now()}`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username,
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };
    const response = await request.post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(userData);
    expect(response.status).toBe(200);
    expect(response.body.profile.username).toBe(username.toLowerCase());

    // cleanup: delete created user
    const deleteResponse = await authRequest
      .delete(`/users/${response.body.profile.username}?hard_delete=true`);
    expect(deleteResponse.status).toBe(200);
  });

  it('should handle concurrent signup requests gracefully', async () => {
    const email = `${prefix}_user_${Date.now()}@example.com`;
    const username = `${prefix}-newuser${Date.now()}`;
    const token = issueSignupToken({
      email,
      nonce: await nonceSerive.createNonce(),
    });
    const userData = {
      email,
      username,
      full_name: 'New User',
      institution_name: 'Test Institution',
      institution_type: 'Other',
      has_agreed_to_terms: true,
    };

    const [response1, response2] = await Promise.all([
      request.post('/auth/signup')
        .set('Authorization', `Bearer ${token}`)
        .send(userData),
      request.post('/auth/signup')
        .set('Authorization', `Bearer ${token}`)
        .send(userData),
    ]);

    expect([response1.status, response2.status]).toContain(200);
    expect([response1.status, response2.status]).toContain(401);

    // cleanup: delete created user if successful
    if (response1.status === 200) {
      const deleteResponse = await authRequest
        .delete(`/users/${response1.body.profile.username}?hard_delete=true`);
      expect(deleteResponse.status).toBe(200);
    }
  });
});
