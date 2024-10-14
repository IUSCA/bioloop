const axios = require('axios');
const config = require('config');

const base64EncodedClientCredentials = btoa(`${config.get('globus.client_id')}:${config.get('globus.client_secret')}`);
const basicAuthHeader = `Basic ${base64EncodedClientCredentials}`
console.log('Globus API base URL:', config.get('globus.token_url'));
console.log('Globus Client ID:', config.get('globus.client_id'));
console.log('Globus Client Secret:', config.get('globus.client_secret'));
console.log('Globus Redirect URI:', config.get('globus.redirect_uri'));
console.log('basic auth header:', basicAuthHeader);


const globusApi = axios.create({
  baseURL: config.get('globus.token_url'),
  headers: { Authorization: basicAuthHeader },
});

const getToken = ({ code }) => {
  console.log('Getting token with code:', code);
  return globusApi.post('/', null, {
    params: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.get('globus.redirect_uri'),
    }
  }).then(response => {
    console.log('Received token:', response.data);
    return response
  });
};

module.exports = { getToken };
