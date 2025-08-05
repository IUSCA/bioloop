import api from '@/services/api'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useTracksStore = defineStore('tracks', () => {
  // State
  const tracks = ref([])
  const currentTrack = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const metadata = ref({
    count: 0,
    limit: 25,
    offset: 0,
    sort_by: 'created_at',
    sort_order: 'desc',
  })

  // Getters
  const getTracks = computed(() => tracks.value)
  const getCurrentTrack = computed(() => currentTrack.value)
  const isLoading = computed(() => loading.value)
  const getError = computed(() => error.value)
  const getMetadata = computed(() => metadata.value)

  // Actions
  const fetchTracks = async (params = {}) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get('/tracks', { params })
      tracks.value = response.data.tracks
      metadata.value = response.data.metadata
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch tracks'
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchTrack = async (id) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get(`/tracks/${id}`)
      currentTrack.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch track'
      throw err
    } finally {
      loading.value = false
    }
  }

  const createTrack = async (trackData) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/tracks', trackData)
      const newTrack = response.data
      
      // Add to tracks list
      tracks.value.unshift(newTrack)
      metadata.value.count += 1
      
      return newTrack
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to create track'
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateTrack = async (id, trackData) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.patch(`/tracks/${id}`, trackData)
      const updatedTrack = response.data
      
      // Update in tracks list
      const index = tracks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tracks.value[index] = updatedTrack
      }
      
      // Update current track if it's the one being updated
      if (currentTrack.value?.id === id) {
        currentTrack.value = updatedTrack
      }
      
      return updatedTrack
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update track'
      throw err
    } finally {
      loading.value = false
    }
  }

  const deleteTrack = async (id) => {
    loading.value = true
    error.value = null
    
    try {
      await api.delete(`/tracks/${id}`)
      
      // Remove from tracks list
      const index = tracks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tracks.value.splice(index, 1)
        metadata.value.count -= 1
      }
      
      // Clear current track if it's the one being deleted
      if (currentTrack.value?.id === id) {
        currentTrack.value = null
      }
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete track'
      throw err
    } finally {
      loading.value = false
    }
  }

  const clearError = () => {
    error.value = null
  }

  const clearCurrentTrack = () => {
    currentTrack.value = null
  }

  return {
    // State
    tracks,
    currentTrack,
    loading,
    error,
    metadata,
    
    // Getters
    getTracks,
    getCurrentTrack,
    isLoading,
    getError,
    getMetadata,
    
    // Actions
    fetchTracks,
    fetchTrack,
    createTrack,
    updateTrack,
    deleteTrack,
    clearError,
    clearCurrentTrack,
  }
})
