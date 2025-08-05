<template>
  <va-inner-loading :loading="loading" class="h-full">
    <va-stepper
      v-model="step"
      :steps="steps"
      controlsHidden
      class="h-full create-session-stepper"
    >
      <!-- Step icons and labels -->
      <template
        v-for="(s, i) in steps"
        :key="s.label"
        #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
      >
        <va-button
          class="step-button p-1 sm:p-3 cursor-pointer"
          :class="{
            'step-button--active': isActive,
            'step-button--completed': isCompleted,
          }"
          @click="setStep(i)"
          :disabled="isStepperButtonDisabled(i)"
          preset="secondary"
        >
          <div class="flex flex-col items-center">
            <Icon :icon="s.icon" />
            <span class="hidden sm:block"> {{ s.label }} </span>
          </div>
        </va-button>
      </template>

      <!-- Step 1: Track Selection -->
      <template #step-content-0>
        <div class="flex flex-col gap-6">
          <div class="">            
            <TracksAsyncAutoComplete
              v-model:selected="selectedTrack"
              v-model:search-term="trackSearch"
              label="Search and Add Tracks"
              placeholder="Search tracks by name"
              @select="addTrack"
            />

            <!-- Selected tracks table -->
            <div v-if="selectedTracksTableData.length > 0" class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  {{ selectedTracksTableData.length }} track{{ selectedTracksTableData.length !== 1 ? 's' : '' }} selected
                </div>
              </div>
              
              <va-data-table
                :items="selectedTracksTableData"
                :columns="selectedTracksColumns"
                class="selected-tracks-table"
                selectable
              >
                <template #cell(name)="{ value }">
                  <div class="font-medium text-sm">{{ value }}</div>
                    <!-- <div class="text-xs text-gray-500">{{ item.file_type }}</div> -->
                </template>

                <template #cell(actions)="{ rowData }">
                  <va-button
                    size="small"
                    plain
                    color="danger"
                    @click="removeTrack(rowData.id)"
                  >
                    <i-mdi-trash-can-outline />
                  </va-button>
                </template>
              </va-data-table>

              <!-- Bulk actions -->
              <div class="flex items-center justify-between pt-2 border-t">
                <va-button
                  v-if="selectedTracksInTable.length > 0"
                  size="small"
                  color="danger"
                  @click="deleteSelectedTracks"
                >
                  Delete Selected ({{ selectedTracksInTable.length }})
                </va-button>
              </div>
            </div>
          </div>

          <!-- Error display -->
          <va-alert
            v-if="formErrors[STEP_KEYS.TRACKS]"
            dense
            icon="mdi-alert-circle"
            color="danger"
          >
            {{ formErrors[STEP_KEYS.TRACKS] }}
          </va-alert>
        </div>
      </template>

      <!-- Step 2: Session Metadata -->
      <template #step-content-1>
        <div class="flex flex-col gap-6">
          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <va-select
                v-model="form.genome_type"
                label="Genome Type"
                placeholder="Select genome type"
                :options="genomeTypeOptions"
                text-by="name"
                value-by="id"
                :error="!!formErrors[STEP_KEYS.METADATA]"
              />

              <va-select
                v-model="form.genome"
                label="Genome Value"
                placeholder="Select genome"
                :options="genomeOptions"
                text-by="name"
                value-by="id"
                :error="!!formErrors[STEP_KEYS.METADATA]"
              />
            </div>

            <va-input
              v-model="form.session_name"
              label="Session Name"
              placeholder="Enter session name"
              :error="!!formErrors[STEP_KEYS.METADATA]"
              :error-messages="formErrors[STEP_KEYS.METADATA] || ''"
              class="w-full"
            />

            <va-checkbox
              v-model="form.is_public"
              label="Make session public"
            />
          </div>
        </div>
      </template>

      <!-- Step 3: Summary -->
      <template #step-content-2>
        <div class="flex flex-col gap-6">
          <div class="">
            <h3 class="text-lg font-medium">Session Summary</h3>
            
            <va-card class="summary-card">
              <va-card-content>
                <div class="va-table-responsive">
                  <table class="va-table">
                    <tbody>
                      <tr>
                        <td class="font-medium">Session Name</td>
                        <td>{{ form.session_name || 'Not specified' }}</td>
                      </tr>
                      <tr>
                        <td class="font-medium">Genome Type</td>
                        <td>{{ form.genome_type ? genomeTypeOptions.find(opt => opt.id === form.genome_type)?.name : 'Not specified' }}</td>
                      </tr>
                      <tr>
                        <td class="font-medium">Genome</td>
                        <td>{{ form.genome || 'Not specified' }}</td>
                      </tr>
                      <tr>
                        <td class="font-medium">Public Session</td>
                        <td>{{ form.is_public ? 'Yes' : 'No' }}</td>
                      </tr>
                      <tr>
                        <td class="font-medium">Selected Tracks</td>
                        <td>{{ selectedTracksTableData.length }} track(s)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- Selected tracks preview -->
                <div v-if="selectedTracksTableData.length > 0" class="mt-4">
                  <h4 class="text-sm font-medium text-gray-700 mb-2">Track Details</h4>
                  <div class="space-y-2">
                    <div
                      v-for="track in selectedTracksTableData"
                      :key="track.id"
                      class="flex items-center space-x-3 p-2 bg-gray-50 rounded"
                    >
                      
                      <span class="text-sm">{{ track.name }}</span>
                      <span class="text-xs text-gray-500">({{ track.file_type }})</span>
                    </div>
                  </div>
                </div>
              </va-card-content>
            </va-card>
          </div>
        </div>
      </template>

      <!-- Custom controls -->
      <template #controls="{ nextStep, prevStep }">
        <div class="flex items-center justify-around w-full">
          <va-button
            class="flex-none"
            preset="primary"
            @click="prevStep"
            :disabled="isPreviousButtonDisabled"
          >
            Previous
          </va-button>
          <va-button
            class="flex-none"
            @click="onNextClick(nextStep)"
            :color="isLastStep ? 'success' : 'primary'"
            :disabled="isNextButtonDisabled"
          >
            {{ isLastStep ? "Create Session" : "Next" }}
          </va-button>
        </div>
      </template>
    </va-stepper>
  </va-inner-loading>
</template>

<script setup>
import TracksAsyncAutoComplete from '@/components/tracks/TracksAsyncAutoComplete.vue';
import constants from '@/constants';
import toast from '@/services/toast';
import { useSessionsStore } from '@/stores/sessions';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';


const emit = defineEmits(['created']);

const router = useRouter();
const sessionsStore = useSessionsStore();

// Step configuration
const STEP_KEYS = {
  TRACKS: 'tracks',
  METADATA: 'metadata',
  SUMMARY: 'summary',
};

const steps = [
  { key: STEP_KEYS.TRACKS, label: 'Select Tracks', icon: 'mdi:chart-gantt' },
  { key: STEP_KEYS.METADATA, label: 'Session Details', icon: 'mdi:information' },
  { key: STEP_KEYS.SUMMARY, label: 'Summary', icon: 'mdi:check-circle' },
];

// Reactive state
const step = ref(0);
const loading = ref(false);
const form = ref({
  genome_type: '',
  genome: '',
  session_name: '',
  is_public: false,
});
const formErrors = ref({
  [STEP_KEYS.TRACKS]: '',
  [STEP_KEYS.METADATA]: '',
  [STEP_KEYS.SUMMARY]: '',
});

// Track selection state
const trackSearch = ref('');
const selectedTrack = ref(null);
const selectedTracksInTable = ref([]);
const selectedTracksTableData = ref([]); 

// Computed properties
const genomeTypeOptions = computed(() => {
  return Object.keys(constants.GENOME_TYPES).map(type => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    id: type,
  }));
});

const genomeOptions = computed(() => {
  if (!form.value.genome_type) return [];
  
  const genomes = constants.GENOME_TYPES[form.value.genome_type]?.genomes || [];
  return genomes.map(genome => ({
    name: genome,
    id: genome,
  }));
});

// Table columns for selected tracks
const selectedTracksColumns = [
  { 
    key: 'name', 
    label: 'Track Name', 
    width: '20%',
    sortable: true,
    align: 'left'
  },
  { 
    key: 'actions',
    label: 'Actions', 
    sortable: false, 
    align: 'right'
  },
];

const isLastStep = computed(() => step.value === steps.length - 1);

const stepHasErrors = computed(() => {
  if (step.value === 0) {
    return !!formErrors.value[STEP_KEYS.TRACKS];
  } else if (step.value === 1) {
    return !!formErrors.value[STEP_KEYS.METADATA];
  }
  return false;
});

const isPreviousButtonDisabled = computed(() => {
  return step.value === 0 || loading.value;
});

const isNextButtonDisabled = computed(() => {
  return stepHasErrors.value || loading.value;
});

const isStepperButtonDisabled = (stepIndex) => {
  return step.value < stepIndex || loading.value;
};

// Watchers
watch(() => form.value.genome_type, () => {
  // Reset genome when genome type changes
  form.value.genome = '';
});

// Initialize form when component mounts
onMounted(async () => {
  initializeForm();
  // Fetch tracks to ensure we have the data available
  // try {
  //   await tracksStore.fetchTracks();
  // } catch (error) {
  //   console.error('Failed to fetch tracks:', error);
  // }
});

const initializeForm = () => {
  step.value = 0;
  form.value = {
    genome_type: '',
    genome: '',
    session_name: '',
    is_public: false,
  };
  formErrors.value = {
    [STEP_KEYS.TRACKS]: '',
    [STEP_KEYS.METADATA]: '',
    [STEP_KEYS.SUMMARY]: '',
  };
  trackSearch.value = '';
  selectedTrack.value = null;
  selectedTracksInTable.value = []; // Reset selected tracks selection
  selectedTracksTableData.value = []; // Reset table data
};

const addTrack = (track) => {
  if (track && !selectedTracksTableData.value.some(item => item.id === track.id)) {
    // Create table data object with safe fallback values
    const tableDataItem = {
      id: track.id || 0,
      name: track.name || track.dataset_file?.name || 'Unknown Track',
      file_type: track.file_type || 'unknown',
      size: track.dataset_file?.size || 0,
      genomeType: track.genomeType || '',
      genomeValue: track.genomeValue || '',
      dataset: track.dataset_file?.dataset || '',
    };
    
    // Add to table data
    selectedTracksTableData.value.push(tableDataItem);
    
    // Clear the selected track and search term
    selectedTrack.value = null;
    trackSearch.value = '';
  }
};

const removeTrack = (trackId) => {
  const index = selectedTracksTableData.value.findIndex(item => item.id === trackId);
  if (index > -1) {
    // Remove from table selection if present
    selectedTracksInTable.value = selectedTracksInTable.value.filter(item => item.id !== trackId);
    // Remove from local state
    selectedTracksTableData.value.splice(index, 1);
  }
};

const removeSelectedTracks = () => {
  const tracksToRemove = selectedTracksInTable.value;
  tracksToRemove.forEach(track => {
    removeTrack(track.id);
  });
  toast.success(`${tracksToRemove.length} track(s) removed`);
};

const deleteSelectedTracks = async () => {
  const tracksToDelete = selectedTracksInTable.value;
  if (tracksToDelete.length === 0) {
    toast.info('No tracks selected for deletion.');
    return;
  }

  if (!confirm(`Are you sure you want to delete ${tracksToDelete.length} track(s)? This action cannot be undone.`)) {
    return;
  }

  loading.value = true;
  try {
    const trackIdsToDelete = tracksToDelete.map(track => track.id);
    await sessionsStore.deleteTracks(trackIdsToDelete);
    toast.success(`${tracksToDelete.length} track(s) deleted successfully.`);
    // Refresh the table data after deletion
    await sessionsStore.fetchTracks();
    selectedTracksTableData.value = sessionsStore.tracks.map(track => ({
      id: track.id,
      name: track.name || track.dataset_file?.name || 'Unknown Track',
      file_type: track.file_type || 'unknown',
      size: track.dataset_file?.size || 0,
      genomeType: track.genomeType || '',
      genomeValue: track.genomeValue || '',
      dataset: track.dataset_file?.dataset || null,
    }));
    selectedTracksInTable.value = []; // Clear selected tracks in table
  } catch (error) {
    console.error('Failed to delete tracks:', error);
    toast.error('Failed to delete tracks');
  } finally {
    loading.value = false;
  }
};


const validateCurrentStep = () => {
  formErrors.value = {
    [STEP_KEYS.TRACKS]: '',
    [STEP_KEYS.METADATA]: '',
    [STEP_KEYS.SUMMARY]: '',
  };

  if (step.value === 0) {
    // Validate track selection
    if (selectedTracksTableData.value.length === 0) {
      formErrors.value[STEP_KEYS.TRACKS] = 'Please select at least one track';
      return false;
    }
  } else if (step.value === 1) {
    // Validate metadata
    if (!form.value.session_name) {
      formErrors.value[STEP_KEYS.METADATA] = 'Session name is required';
      return false;
    }
    
    if (!form.value.genome_type) {
      formErrors.value[STEP_KEYS.METADATA] = 'Genome type is required';
      return false;
    }
    
    if (!form.value.genome) {
      formErrors.value[STEP_KEYS.METADATA] = 'Genome value is required';
      return false;
    }
  }

  return true;
};

const onNextClick = async (nextStep) => {
  if (!validateCurrentStep()) {
    return;
  }

  if (isLastStep.value) {
    // Create the session
    await createSession();
  } else {
    nextStep();
  }
};

const createSession = async () => {
  loading.value = true;
  
  try {
    const sessionData = {
      genome_type: form.value.genome_type,
      genome: form.value.genome,
      session_name: form.value.session_name,
      is_public: form.value.is_public,
      track_ids: selectedTracksTableData.value.map(track => track.id),
    };
    
    const session = await sessionsStore.createSession(sessionData);
    emit('created', session);
    toast.success('Session created successfully');
    
    // Navigate back to sessions list
    // router.push('/sessions');
  } catch (error) {
    console.error('Failed to create session:', error);
    toast.error('Failed to create session');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.create-session-stepper {
  @apply h-full;
}

</style> 