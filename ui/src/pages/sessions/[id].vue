<template>
  <div class="session-detail p-6">
    <div v-if="loading" class="flex justify-center items-center h-64">
      <va-progress-circular indeterminate />
    </div>

    <div v-else-if="error" class="text-center text-red-600">
      {{ error }}
    </div>

    <div v-else-if="session" class="space-y-6">
      <!-- Header -->
      <div class="flex justify-between items-start">
        <div>
          <h1 class="text-3xl font-bold">{{ session.title }}</h1>
          <p class="text-gray-600 mt-2">
            Created by {{ session.user?.name || session.user?.username }} on {{ formatDate(session.created_at) }}
          </p>
        </div>
        
        <div class="flex gap-2">
          <va-button
            v-if="canEditSession"
            preset="primary"
            @click="editSession"
          >
            <va-icon name="edit" class="mr-2" />
            Edit
          </va-button>
          
          <va-button
            v-if="canDeleteSession"
            preset="danger"
            @click="deleteSession"
          >
            <va-icon name="delete" class="mr-2" />
            Delete
          </va-button>
        </div>
      </div>

      <!-- Session info -->
      <va-card>
        <va-card-title>Session Information</va-card-title>
        <va-card-content>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="text-sm font-medium text-gray-600">Genome Type</label>
              <div class="mt-1">
                <va-chip size="small" preset="secondary">
                  {{ session.genome_type }}
                </va-chip>
              </div>
            </div>
            
            <div>
              <label class="text-sm font-medium text-gray-600">Genome</label>
              <div class="mt-1">
                <va-chip size="small" preset="primary">
                  {{ session.genome }}
                </va-chip>
              </div>
            </div>
            
            <div>
              <label class="text-sm font-medium text-gray-600">Visibility</label>
              <div class="mt-1">
                <va-chip size="small" :preset="session.is_public ? 'success' : 'warning'">
                  {{ session.is_public ? 'Public' : 'Private' }}
                </va-chip>
              </div>
            </div>
          </div>
        </va-card-content>
      </va-card>

      <!-- Tracks -->
      <va-card>
        <va-card-title>
          Tracks ({{ session.session_tracks?.length || 0 }})
        </va-card-title>
        <va-card-content>
          <div v-if="session.session_tracks?.length > 0" class="space-y-4">
            <div
              v-for="sessionTrack in session.session_tracks"
              :key="sessionTrack.id"
              class="border rounded p-4"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="font-medium">{{ sessionTrack.track.name }}</div>
                  <div class="text-sm text-gray-600">
                    {{ sessionTrack.track.file_type }} • {{ sessionTrack.track.genomeType }} {{ sessionTrack.track.genomeValue }}
                  </div>
                  <div class="text-xs text-gray-500">
                    Dataset: {{ sessionTrack.track.dataset_file?.dataset?.name }}
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  <div
                    v-if="sessionTrack.color"
                    class="w-4 h-4 rounded border"
                    :style="{ backgroundColor: sessionTrack.color }"
                  ></div>
                  <span class="text-sm text-gray-500">Order: {{ sessionTrack.order }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="text-center text-gray-500 py-8">
            No tracks in this session.
          </div>
        </va-card-content>
      </va-card>

      <!-- Genome Browser Integration Placeholder -->
      <va-card>
        <va-card-title>Genome Browser View</va-card-title>
        <va-card-content>
          <div class="text-center py-12 text-gray-500">
            <va-icon name="mdi-dna" class="text-6xl mb-4" />
            <p class="text-lg">Genome Browser Integration</p>
            <p class="text-sm">This would integrate with a genome browser like IGV.js or JBrowse</p>
            <p class="text-sm">Session ID: {{ session.id }}</p>
          </div>
        </va-card-content>
      </va-card>
    </div>

    <!-- Edit Modal -->
    <edit-session-modal
      v-model="showEditModal"
      :session="session"
      @updated="handleSessionUpdated"
    />
  </div>
</template>

<script setup>
import EditSessionModal from '@/components/sessions/EditSessionModal.vue';
import { formatDate } from '@/services/datetime';
import { useAuthStore } from '@/stores/auth';
import { useSessionsStore } from '@/stores/sessions';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const sessionsStore = useSessionsStore();
const auth = useAuthStore();

// Reactive state
const showEditModal = ref(false);

// Computed
const session = computed(() => sessionsStore.currentSession);
const loading = computed(() => sessionsStore.loading);
const error = computed(() => sessionsStore.error);

const canEditSession = computed(() => {
  return session.value?.user_id === auth.user?.id;
});

const canDeleteSession = computed(() => {
  return session.value?.user_id === auth.user?.id;
});

// Methods
const editSession = () => {
  showEditModal.value = true;
};

const deleteSession = async () => {
  if (!session.value) return;
  
  if (confirm(`Are you sure you want to delete the session "${session.value.title}"?`)) {
    try {
      await sessionsStore.deleteSession(session.value.id);
      router.push('/sessions');
    } catch (error) {
      // Error is handled by the store
    }
  }
};

const handleSessionUpdated = (updatedSession) => {
  showEditModal.value = false;
  // The store will update the current session
};

const loadSession = async () => {
  const sessionId = parseInt(route.params.id);
  if (isNaN(sessionId)) {
    router.push('/sessions');
    return;
  }
  
  try {
    await sessionsStore.fetchSession(sessionId);
  } catch (error) {
    // Error is handled by the store
  }
};

// Lifecycle
onMounted(() => {
  loadSession();
});
</script> 