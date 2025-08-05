<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1" v-if="activeFilters.length === 0">
        <va-input
          v-model="inclusive_query"
          class="w-full"
          placeholder="Search Sessions by title"
          outline
          clearable
          @input="handleSearch"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- Filter button -->
      <va-button @click="showSearchModal = true" preset="primary" class="flex-none">
        <i-mdi-filter />
        <span> Filters </span>
      </va-button>

      <!-- active filter chips -->
      <session-search-filters
        v-if="activeFilters.length > 0"
        class="flex-none"
        :filters="filters"
        @remove-filter="removeFilter"
        @clear-all="clearFilters"
      />

      <!-- Create Session button -->
      <div class="flex-none">
        <va-button
          icon="add"
          class="px-1"
          color="success"
          @click="showCreateModal = true"
        >
          Create Session
        </va-button>
      </div>
    </div>

    <!-- Sessions table -->
    <va-data-table
      :items="sessions"
      :columns="columns"
      :loading="loading"
      :items-per-page="query.page_size"
      :total-items="metadata?.count || 0"
      @update:page="handlePageChange"
      @update:sort-by="handleSortChange"
      @update:sort-order="handleSortChange"
    >
        <template #cell(title)="{ item }">
          <div class="font-medium">{{ item.title }}</div>
        </template>

        <template #cell(genome)="{ item }">
          <va-chip size="small" preset="primary">
            {{ item.genome }}
          </va-chip>
        </template>

        <template #cell(genome_type)="{ item }">
          <va-chip size="small" preset="secondary">
            {{ item.genome_type }}
          </va-chip>
        </template>

        <template #cell(tracks_count)="{ item }">
          <span class="text-sm text-gray-600">
            {{ item._count?.session_tracks || 0 }} tracks
          </span>
        </template>

        <template #cell(owner)="{ item }">
          <div class="text-sm">
            <div class="font-medium">{{ item.user?.name || item.user?.username }}</div>
            <div class="text-gray-500">{{ item.user?.username }}</div>
          </div>
        </template>

        <template #cell(created_at)="{ item }">
          <span class="text-sm text-gray-600">
            {{ date(item.created_at) }}
          </span>
        </template>

        <template #cell(actions)="{ item }">
          <div class="flex gap-1">
            <va-button
              preset="plain"
              class="flex-auto"
              @click="viewSession(item)"
            >
              <va-icon name="visibility" />
            </va-button>
            
            <va-button
              v-if="canEditSession(item)"
              preset="plain"
              class="flex-auto"
              @click="editSession(item)"
            >
              <va-icon name="edit" />
            </va-button>
            
            <va-button
              v-if="canDeleteSession(item)"
              preset="plain"
              class="flex-auto"
              color="danger"
              @click="deleteSession(item)"
            >
              <va-icon name="delete" />
            </va-button>
          </div>
        </template>
      </va-data-table>

    <!-- Search Modal -->
    <session-search-modal
      v-model="showSearchModal"
      :filters="filters"
      @apply="applyFilters"
      @reset="resetFilters"
    />

    <!-- Create Modal -->
    <create-session-modal
      v-model="showCreateModal"
      @created="handleSessionCreated"
    />

    <!-- Edit Modal -->
    <edit-session-modal
      v-model="showEditModal"
      :session="editingSession"
      @updated="handleSessionUpdated"
    />
  </div>
</template>

<script setup>
import CreateSessionModal from '@/components/sessions/CreateSessionModal.vue';
import EditSessionModal from '@/components/sessions/EditSessionModal.vue';
import SessionSearchFilters from '@/components/sessions/SessionSearchFilters.vue';
import SessionSearchModal from '@/components/sessions/SessionSearchModal.vue';
import { date } from '@/services/datetime';
import { useAuthStore } from '@/stores/auth';
import { useSessionsStore } from '@/stores/sessions';
import { useDebounceFn } from '@vueuse/core';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const sessionsStore = useSessionsStore();
const auth = useAuthStore();

// Reactive state
const showSearchModal = ref(false);
const showCreateModal = ref(false);
const showEditModal = ref(false);
const editingSession = ref(null);
const inclusive_query = ref('');

// Query parameters
const query = ref({
  page: 1,
  page_size: 25,
  sort_by: 'created_at',
  sort_order: 'desc',
});

// Filters
const filters = ref({
  title: '',
  genome: '',
  genome_type: '',
});

// Default values function for query persistence
const defaultParams = () => ({
  page: 1,
  page_size: 25,
  sort_by: 'created_at',
  sort_order: 'desc',
});

const defaultFilters = () => ({
  title: '',
  genome: '',
  genome_type: '',
});

// Computed
const sessions = computed(() => sessionsStore.sessions);
const loading = computed(() => sessionsStore.loading);
const metadata = computed(() => sessionsStore.metadata);

const activeFilters = computed(() => {
  const active = [];
  Object.entries(filters.value).forEach(([key, value]) => {
    if (value && value.trim() !== '') {
      active.push({ key, value });
    }
  });
  return active;
});

// Table columns configuration
const columns = [
  {
    key: 'title',
    label: 'Title',
    sortable: true,
    width: '25%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
  {
    key: 'genome',
    label: 'Genome',
    sortable: true,
    width: '15%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
  {
    key: 'genome_type',
    label: 'Genome Type',
    sortable: true,
    width: '15%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
  {
    key: 'tracks_count',
    label: 'Tracks',
    sortable: false,
    width: '10%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
  {
    key: 'owner',
    label: 'Owner',
    sortable: false,
    width: '15%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
  {
    key: 'created_at',
    label: 'Created',
    sortable: true,
    width: '10%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
  {
    key: 'actions',
    label: 'Actions',
    sortable: false,
    width: '10%',
    thStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
    tdStyle: 'white-space: pre-wrap; word-wrap: break-word; word-break: break-word;',
  },
];

// Methods
const canEditSession = (session) => {
  return session.user_id === auth.user?.id;
};

const canDeleteSession = (session) => {
  return session.user_id === auth.user?.id;
};

const fetchSessions = async () => {
  try {
    const params = {
      ...filters.value,
      ...(inclusive_query.value ? { title: inclusive_query.value } : {}),
      limit: query.value.page_size,
      offset: (query.value.page - 1) * query.value.page_size,
      sort_by: query.value.sort_by,
      sort_order: query.value.sort_order,
    };
    
    await sessionsStore.fetchSessions(params);
  } catch (error) {
    console.error('Error fetching sessions:', error);
  }
};

const handleSearch = useDebounceFn(() => {
  query.value.page = 1; // Reset to first page when searching
  fetchSessions();
}, 300);

const handlePageChange = (page) => {
  query.value.page = page;
};

const handleSortChange = (sortBy, sortOrder) => {
  query.value.sort_by = sortBy;
  query.value.sort_order = sortOrder;
  query.value.page = 1; // Reset to first page when sorting
};

const applyFilters = (newFilters) => {
  filters.value = { ...newFilters };
  query.value.page = 1; // Reset to first page when filtering
  showSearchModal.value = false;
};

const resetFilters = () => {
  filters.value = { ...defaultFilters() };
  inclusive_query.value = '';
  query.value.page = 1; // Reset to first page when resetting
  showSearchModal.value = false;
};

const removeFilter = (key) => {
  filters.value[key] = '';
  if (key === 'title') {
    inclusive_query.value = '';
  }
  query.value.page = 1; // Reset to first page when removing filter
};

const clearFilters = () => {
  resetFilters();
};

const viewSession = (session) => {
  // Navigate to session detail page
  router.push(`/sessions/${session.id}`);
};

const editSession = (session) => {
  editingSession.value = session;
  showEditModal.value = true;
};

const deleteSession = async (session) => {
  if (confirm(`Are you sure you want to delete the session "${session.title}"?`)) {
    try {
      await sessionsStore.deleteSession(session.id);
      await fetchSessions(); // Refresh the list
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }
};

const handleSessionCreated = () => {
  showCreateModal.value = false;
  fetchSessions(); // Refresh the list
};

const handleSessionUpdated = () => {
  showEditModal.value = false;
  editingSession.value = null;
  fetchSessions(); // Refresh the list
};

// Watch for changes in query and filters
watch([query, filters], () => {
  fetchSessions();
}, { deep: true });

// Initial load
onMounted(() => {
  fetchSessions();
});
</script>

<route lang="yaml">
meta:
  title: Sessions
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Sessions" }]
</route> 