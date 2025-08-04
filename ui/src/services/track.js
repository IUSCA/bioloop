import api from "./api";

class TrackService {
  /**
   * Get all tracks accessible to the current user
   * @param {Object} params - Query parameters
   * @param {string} params.project_id - Optional project filter
   * @param {string} params.file_type - Optional file type filter
   * @param {string} params.genome_type - Optional genome type filter
   * @param {string} params.genome_value - Optional genome value filter
   * @param {number} params.limit - Number of tracks to retrieve
   * @param {number} params.offset - Database offset
   * @param {string} params.sort_by - Sort field
   * @param {string} params.sort_order - Sort order (asc/desc)
   * @returns {Promise} Object containing tracks and count
   */
  getAll(params = {}) {
    return api.get("/tracks", {
      params,
    });
  }

  /**
   * Get all tracks for a specific user (ownership-based access control)
   * @param {string} username - Username to get tracks for
   * @param {Object} params - Query parameters
   * @returns {Promise} Object containing tracks and count
   */
  getByUsername(username, params = {}) {
    return api.get(`/tracks/${username}`, {
      params,
    });
  }

  /**
   * Get a specific track by ID
   * @param {number} id - Track ID
   * @returns {Promise} Track object
   */
  getById(id) {
    return api.get(`/tracks/${id}`);
  }

  /**
   * Create a new track (admin/operator only)
   * @param {Object} trackData - Track data
   * @param {string} trackData.name - Track name
   * @param {string} trackData.file_type - File type (e.g., 'bam', 'vcf', 'bigwig')
   * @param {string} trackData.genome_type - Genome type (e.g., 'assembly', 'version')
   * @param {string} trackData.genome_value - Genome value (e.g., 'hg38', 'GRCh38')
   * @param {number} trackData.dataset_file_id - Dataset file ID
   * @param {Array} trackData.project_ids - Optional array of project IDs
   * @returns {Promise} Created track object
   */
  create(trackData) {
    return api.post("/tracks", trackData);
  }

  /**
   * Update an existing track (admin/operator only)
   * @param {number} id - Track ID
   * @param {Object} trackData - Track data to update
   * @returns {Promise} Updated track object
   */
  update(id, trackData) {
    return api.patch(`/tracks/${id}`, trackData);
  }

  /**
   * Delete a track (admin/operator only - bypasses project access control)
   * @param {number} id - Track ID
   * @returns {Promise} Empty response
   */
  delete(id) {
    return api.delete(`/tracks/${id}`);
  }
}

export default new TrackService();
