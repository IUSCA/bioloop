import trackService from "@/services/track";
import { mapValues } from "@/services/utils";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useTracksStore = defineStore("tracks", () => {
  // State
  const tracks = ref([]);
  const currentTrack = ref(null);
  const loading = ref(false);
  const error = ref(null);

  function defaultFilters() {
    return {
      project_id: null,
      file_type: null,
      genome_type: null,
      genome_value: null,
      name: null,
    };
  }

  function defaultQuery() {
    return {
      page: 1,
      page_size: 25,
      sort_by: "created_at",
      sort_order: "desc",
    };
  }

  function defaultParams() {
    return {
      filters: defaultFilters(),
      query: defaultQuery(),
      inclusive_query: null,
    };
  }

  const params = ref({
    filters: defaultFilters(),
    query: defaultQuery(),
    inclusive_query: null,
  });

  const filters = computed({
    get: () => params.value.filters,
    set: (newFilters) => {
      params.value.filters = newFilters;
    },
  });

  const query = computed({
    get: () => params.value.query,
    set: (newQuery) => {
      params.value.query = newQuery;
    },
  });

  // Computed
  const filterStatus = computed(() => {
    const defaults = defaultFilters();
    return mapValues(
      params.value.filters,
      (key, value) => value !== defaults[key],
    );
  });

  const activeFilters = computed(() => {
    return Object.keys(filterStatus.value).filter(
      (key) => filterStatus.value[key],
    );
  });

  // Actions
  async function fetchTracks() {
    loading.value = true;
    error.value = null;
    
    try {
      const filters_api = {
        ...params.value.filters,
        ...(params.value.inclusive_query
          ? { name: params.value.inclusive_query }
          : null),
      };

      const offset = (params.value.query.page - 1) * params.value.query.page_size;
      
      const response = await trackService.getAll({
        ...filters_api,
        limit: params.value.query.page_size,
        offset: offset,
        sort_by: params.value.query.sort_by,
        sort_order: params.value.query.sort_order,
      });
      
      tracks.value = response.data.tracks;
      return response.data;
    } catch (err) {
      error.value = err.message || 'Failed to fetch tracks';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchTrack(id) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await trackService.getById(id);
      currentTrack.value = response.data;
      return response.data;
    } catch (err) {
      error.value = err.message || 'Failed to fetch track';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createTrack(trackData) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await trackService.create(trackData);
      tracks.value.unshift(response.data);
      return response.data;
    } catch (err) {
      error.value = err.message || 'Failed to create track';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateTrack(id, trackData) {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await trackService.update(id, trackData);
      
      // Update in tracks array
      const index = tracks.value.findIndex(track => track.id === id);
      if (index !== -1) {
        tracks.value[index] = response.data;
      }
      
      // Update current track if it's the one being updated
      if (currentTrack.value && currentTrack.value.id === id) {
        currentTrack.value = response.data;
      }
      
      return response.data;
    } catch (err) {
      error.value = err.message || 'Failed to update track';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteTrack(id) {
    loading.value = true;
    error.value = null;
    
    try {
      await trackService.delete(id);
      
      // Remove from tracks array
      const index = tracks.value.findIndex(track => track.id === id);
      if (index !== -1) {
        tracks.value.splice(index, 1);
      }
      
      // Clear current track if it's the one being deleted
      if (currentTrack.value && currentTrack.value.id === id) {
        currentTrack.value = null;
      }
    } catch (err) {
      error.value = err.message || 'Failed to delete track';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function resetFilters() {
    params.value.filters = defaultFilters();
  }

  function resetQuery() {
    params.value.query = defaultQuery();
  }

  function resetFilterByKey(key) {
    const defaults = defaultFilters();
    params.value.filters[key] = defaults[key];
  }

  function reset() {
    resetFilters();
    resetQuery();
    tracks.value = [];
    currentTrack.value = null;
    error.value = null;
  }

  return {
    // State
    tracks,
    currentTrack,
    loading,
    error,
    params,
    
    // Computed
    filters,
    query,
    filterStatus,
    activeFilters,
    
    // Actions
    fetchTracks,
    fetchTrack,
    createTrack,
    updateTrack,
    deleteTrack,
    reset,
    resetFilters,
    resetQuery,
    resetFilterByKey,
    
    // Defaults
    defaultFilters,
    defaultQuery,
    defaultParams,
  };
});
