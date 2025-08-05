import api from './api';

/**
 * Get all sessions accessible to the current user
 * @param {Object} params - Query parameters
 * @param {string} params.title - Filter by title
 * @param {string} params.genome - Filter by genome
 * @param {string} params.genome_type - Filter by genome type
 * @param {number} params.limit - Number of results to return
 * @param {number} params.offset - Number of results to skip
 * @param {string} params.sort_by - Field to sort by
 * @param {string} params.sort_order - Sort order (asc/desc)
 * @returns {Promise<Object>} Sessions and metadata
 */
export const getAll = (params = {}) => {
  return api.get('/sessions', { params });
};

/**
 * Get sessions for a specific user
 * @param {string} username - Username to get sessions for
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Sessions and metadata
 */
export const getByUsername = (username, params = {}) => {
  return api.get(`/sessions/${username}`, { params });
};

/**
 * Get a specific session by ID
 * @param {number} id - Session ID
 * @returns {Promise<Object>} Session data
 */
export const getById = (id) => {
  return api.get(`/sessions/${id}`);
};

/**
 * Create a new session
 * @param {Object} sessionData - Session data
 * @param {string} sessionData.title - Session title
 * @param {string} sessionData.genome - Genome
 * @param {string} sessionData.genome_type - Genome type
 * @param {Array<number>} sessionData.track_ids - Array of track IDs
 * @param {boolean} sessionData.is_public - Whether session is public
 * @returns {Promise<Object>} Created session
 */
export const create = (sessionData) => {
  return api.post('/sessions', sessionData);
};

/**
 * Update a session
 * @param {number} id - Session ID
 * @param {Object} sessionData - Session data to update
 * @returns {Promise<Object>} Updated session
 */
export const update = (id, sessionData) => {
  return api.patch(`/sessions/${id}`, sessionData);
};

/**
 * Delete a session
 * @param {number} id - Session ID
 * @returns {Promise<void>}
 */
export const deleteSession = (id) => {
  return api.delete(`/sessions/${id}`);
};

 