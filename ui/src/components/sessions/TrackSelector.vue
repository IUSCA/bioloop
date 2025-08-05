<template>
  <div class="track-selector">
    <!-- Search and filters -->
    <div class="flex mb-4 gap-3">
      <va-input
        v-model="searchQuery"
        placeholder="Search tracks..."
        class="flex-1"
        prepend-icon="mdi-magnify"
      />
      <va-button
        @click="showFilters = !showFilters"
        :preset="showFilters ? 'primary' : 'secondary'"
      >
        Filters
      </va-button>
    </div>

    <!-- Filters -->
    <va-collapse v-model="showFilters" class="mb-4">
      <div class="flex gap-4 p-4 bg-gray-50 rounded">
        <va-select
          v-model="selectedFileType"
          :options="fileTypeOptions"
          label="File Type"
          placeholder="All types"
          class="w-48"
        />
        <va-select
          v-model="selectedGenomeType"
          :options="genomeTypeOptions"
          label="Genome Type"
          placeholder="All genomes"
          class="w-48"
        />
        <va-checkbox
          v-model="showOnlyStaged"
          label="Show only staged tracks"
        />
      </div>
    </va-collapse>

    <!-- Track list -->
    <div class="track-list">
      <va-data-table
        :items="filteredTracks"
        :columns="columns"
        :loading="loading"
        selectable
        v-model:selected-items="selectedTracks"
        class="mb-4"
      >
        <template #cell(selected)="{ item }">
          <va-checkbox
            v-model="item.selected"
            @update:model-value="toggleTrackSelection(item)"
          />
        </template>
        
        <template #cell(filename)="{ item }">
          <div class="flex items-center gap-2">
            <span>{{ item.filename || item.name }}</span>
            <va-badge
              v-if="!item.is_staged"
              color="warning"
              text="Not staged"
              size="small"
            />
            <va-badge
              v-else
              color="success"
              text="Available"
              size="small"
            />
          </div>
        </template>

        <template #cell(size)="{ item }">
          {{ formatFileSize(item.size) }}
        </template>

        <template #cell(file_type)="{ item }">
          <va-chip
            :color="getFileTypeColor(item.file_type)"
            size="small"
          >
            {{ item.file_type?.toUpperCase() || 'Unknown' }}
          </va-chip>
        </template>

        <template #cell(genome)="{ item }">
          <div class="text-sm">
            <div class="font-medium">{{ item.genomeType }}</div>
            <div class="text-gray-600">{{ item.genomeValue }}</div>
          </div>
        </template>

        <template #cell(dataset)="{ item }">
          <div class="text-sm">
            <div class="font-medium">{{ item.dataset?.name }}</div>
            <div class="text-gray-600">ID: {{ item.dataset?.id }}</div>
          </div>
        </template>
      </va-data-table>
    </div>

    <!-- Selection summary -->
    <div v-if="selectedTracks.length > 0" class="selection-summary p-4 bg-blue-50 rounded">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-medium text-blue-900">
            {{ selectedTracks.length }} track{{ selectedTracks.length !== 1 ? 's' : '' }} selected
          </h4>
          <p class="text-sm text-blue-700">
            {{ stagedCount }} available, {{ notStagedCount }} need staging
          </p>
        </div>
        <va-button
          @click="clearSelection"
          preset="secondary"
          size="small"
        >
          Clear Selection
        </va-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { GENOME_TYPES } from '@/constants'
import { useTracksStore } from '@/stores/tracks'
import { formatFileSize } from '@/utils/fileSize'
import { computed, onMounted, ref } from 'vue'

// Props
const props = defineProps({
  projectId: {
    type: [String, Number],
    default: null,
  },
})

// Emits
const emit = defineEmits(['tracksSelected'])

// Store
const tracksStore = useTracksStore()

// Reactive data
const searchQuery = ref('')
const selectedFileType = ref('')
const selectedGenomeType = ref('')
const showOnlyStaged = ref(false)
const showFilters = ref(false)
const selectedTracks = ref([])
const loading = ref(false)

// Computed properties
const fileTypeOptions = computed(() => [
  { text: 'All types', value: '' },
  { text: 'BAM', value: 'bam' },
  { text: 'BigWig', value: 'bigwig' },
  { text: 'VCF', value: 'vcf' },
  { text: 'BigWig (bw)', value: 'bw' },
])

const genomeTypeOptions = computed(() => [
  { text: 'All genomes', value: '' },
  ...Object.keys(GENOME_TYPES).map(key => ({
    text: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
    value: key,
  })),
])

const filteredTracks = computed(() => {
  let tracks = tracksStore.tracks

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    tracks = tracks.filter(track => 
      track.name.toLowerCase().includes(query) ||
      (track.filename && track.filename.toLowerCase().includes(query)) ||
      track.dataset?.name.toLowerCase().includes(query)
    )
  }

  // Apply file type filter
  if (selectedFileType.value) {
    tracks = tracks.filter(track => track.file_type === selectedFileType.value)
  }

  // Apply genome type filter
  if (selectedGenomeType.value) {
    tracks = tracks.filter(track => track.genomeType === selectedGenomeType.value)
  }

  // Apply staging filter
  if (showOnlyStaged.value) {
    tracks = tracks.filter(track => track.is_staged)
  }

  return tracks
})

const stagedCount = computed(() => 
  selectedTracks.value.filter(track => track.is_staged).length
)

const notStagedCount = computed(() => 
  selectedTracks.value.filter(track => !track.is_staged).length
)

// Table columns
const columns = [
  {
    key: 'selected',
    label: '',
    sortable: false,
    width: '50px',
  },
  {
    key: 'filename',
    label: 'Filename',
    sortable: true,
    width: '25%',
  },
  {
    key: 'size',
    label: 'Size',
    sortable: true,
    width: '10%',
  },
  {
    key: 'file_type',
    label: 'Type',
    sortable: true,
    width: '10%',
  },
  {
    key: 'genome',
    label: 'Genome',
    sortable: true,
    width: '20%',
  },
  {
    key: 'dataset',
    label: 'Dataset',
    sortable: true,
    width: '20%',
  },
  {
    key: 'created_at',
    label: 'Uploaded',
    sortable: true,
    width: '15%',
  },
]

// Methods
const getFileTypeColor = (fileType) => {
  const colors = {
    bam: 'primary',
    bigwig: 'success',
    bw: 'success',
    vcf: 'warning',
  }
  return colors[fileType] || 'secondary'
}

const toggleTrackSelection = (track) => {
  const index = selectedTracks.value.findIndex(t => t.id === track.id)
  if (index > -1) {
    selectedTracks.value.splice(index, 1)
  } else {
    selectedTracks.value.push(track)
  }
  emitSelection()
}

const clearSelection = () => {
  selectedTracks.value = []
  emitSelection()
}

const emitSelection = () => {
  emit('tracksSelected', selectedTracks.value)
}

const loadTracks = async () => {
  loading.value = true
  try {
    await tracksStore.fetchTracks({
      project_id: props.projectId,
      limit: 1000, // Get more tracks for selection
    })
  } catch (error) {
    console.error('Error loading tracks:', error)
  } finally {
    loading.value = false
  }
}

// Lifecycle
onMounted(() => {
  loadTracks()
})
</script>

<style scoped>
.track-selector {
  width: 100%;
}

.selection-summary {
  border: 1px solid #dbeafe;
}
</style> 