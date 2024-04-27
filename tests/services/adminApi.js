import axios from 'axios';
import testConfig from 'config';
import https from 'node:https';

import { ADMIN_STORAGE_STATE } from '../playwright.config';

const fsPromises = require('fs/promises');

const axiosInstance = axios.create({
  baseURL: testConfig.apiBasePath,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  // httpAgent: new https.Agent({ rejectUnauthorized: false }),
});

axiosInstance.interceptors.request.use(
  async (config) => {
    // const _token = JSON.parse
    let token = '';
    try {
      const admin_storage_state = JSON.parse(await fsPromises.readFile(ADMIN_STORAGE_STATE, { encoding: 'utf8' }));
      const { localStorage } = admin_storage_state.origins[0];
      token = localStorage.find((e) => e.name === 'token').value;

      console.log('token');
      console.log(token);
    } catch (e) {
      console.log('Could not retrieve token from localStorage');
      console.error(e);
    }
    if (token) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${token}`;
      // eslint-disable-next-line no-param-reassign
      config.headers['Content-Type'] = 'application/json';
    } else {
      throw new Error('No token found in localStorage');
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// If API call has failed because of 401 Unauthorized
// navigate to logout page
axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      console.error('Error: Unauthorized', err);
      // router.push('/auth/logout'); // logout
    }
    return Promise.reject(err);
  },
);

export default axiosInstance;
