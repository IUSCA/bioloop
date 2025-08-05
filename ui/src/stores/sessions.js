import api from '@/services/api'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSessionsStore = defineStore('sessions', () => {
  // State
  const sessions = ref([])
  const currentSession = ref(null)
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
  const getSessions = computed(() => sessions.value)
  const getCurrentSession = computed(() => currentSession.value)
  const isLoading = computed(() => loading.value)
  const getError = computed(() => error.value)
  const getMetadata = computed(() => metadata.value)

  // Actions
  const fetchSessions = async (params = {}) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get('/sessions', { params })
      sessions.value = response.data.sessions
      metadata.value = response.data.metadata
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch sessions'
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchSession = async (id) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get(`/sessions/${id}`)
      currentSession.value = response.data
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to fetch session'
      throw err
    } finally {
      loading.value = false
    }
  }

  const createSession = async (sessionData) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/sessions', sessionData)
      const newSession = response.data
      
      // Add to sessions list
      sessions.value.unshift(newSession)
      metadata.value.count += 1
      
      return newSession
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to create session'
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateSession = async (id, sessionData) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.patch(`/sessions/${id}`, sessionData)
      const updatedSession = response.data
      
      // Update in sessions list
      const index = sessions.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sessions.value[index] = updatedSession
      }
      
      // Update current session if it's the one being updated
      if (currentSession.value?.id === id) {
        currentSession.value = updatedSession
      }
      
      return updatedSession
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to update session'
      throw err
    } finally {
      loading.value = false
    }
  }

  const deleteSession = async (id) => {
    loading.value = true
    error.value = null
    
    try {
      await api.delete(`/sessions/${id}`)
      
      // Remove from sessions list
      const index = sessions.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sessions.value.splice(index, 1)
        metadata.value.count -= 1
      }
      
      // Clear current session if it's the one being deleted
      if (currentSession.value?.id === id) {
        currentSession.value = null
      }
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to delete session'
      throw err
    } finally {
      loading.value = false
    }
  }

  const requestStaging = async (sessionId, stagingData) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post(`/sessions/${sessionId}/stage`, stagingData)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to request staging'
      throw err
    } finally {
      loading.value = false
    }
  }

  const shareSession = async (sessionId, shareData) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post(`/sessions/${sessionId}/share`, shareData)
      return response.data
    } catch (err) {
      error.value = err.response?.data?.error || 'Failed to share session'
      throw err
    } finally {
      loading.value = false
    }
  }

  const clearError = () => {
    error.value = null
  }

  const clearCurrentSession = () => {
    currentSession.value = null
  }

  return {
    // State
    sessions,
    currentSession,
    loading,
    error,
    metadata,
    
    // Getters
    getSessions,
    getCurrentSession,
    isLoading,
    getError,
    getMetadata,
    
    // Actions
    fetchSessions,
    fetchSession,
    createSession,
    updateSession,
    deleteSession,
    requestStaging,
    shareSession,
    clearError,
    clearCurrentSession,
  }
}) 