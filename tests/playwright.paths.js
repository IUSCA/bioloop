/**
 * Paths shared by Playwright config and login setup projects.
 * Kept separate so `playwright.config.js` can use an async `defineConfig`
 * export.
 */

const path = require('path');

const USER_STORAGE_STATE = path.join(__dirname, '.auth/user_storage_state.json');
const OPERATOR_STORAGE_STATE = path.join(__dirname, '.auth/operator_storage_state.json');
const ADMIN_STORAGE_STATE = path.join(__dirname, '.auth/admin_storage_state.json');

module.exports = {
  USER_STORAGE_STATE,
  OPERATOR_STORAGE_STATE,
  ADMIN_STORAGE_STATE,
};
