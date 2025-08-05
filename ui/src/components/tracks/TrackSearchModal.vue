<template>
  <va-modal
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    title="Track Search"
  >
    <div class="w-full">
      <va-form class="flex flex-col gap-3 md:gap-5">
        <!-- name filter -->
        <va-input
          label="Name"
          v-model="form.name"
          placeholder="Enter a term that matches any part of the track name"
        />

        <!-- project_id filter -->
        <va-input
          label="Project ID"
          v-model="form.project_id"
          placeholder="Enter project ID to filter by"
        />

        <!-- file_type filter -->
        <va-select
          v-model="form.file_type"
          :options="fileTypeOptions"
          text-by="name"
          value-by="id"
          label="File Type"
          placeholder="Choose a file type"
        >
          <template #prependInner>
            <Icon icon="mdi:file-document" class="text-xl" />
          </template>
        </va-select>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <!-- genome_type filter -->
        <va-select
          v-model="form.genome_type"
          :options="genomeTypeOptions"
          text-by="name"
          value-by="id"
          label="Genome Type"
          placeholder="Choose a genome type"
        >
          <template #prependInner>
            <Icon icon="mdi:dna" class="text-xl" />
          </template>
        </va-select>

        <!-- genome_value filter -->
        <va-select
          v-model="form.genome_value"
          :options="genomeValueOptions"
          text-by="name"
          value-by="id"
          label="Genome Value"
          placeholder="Choose a genome value"
        >
          <template #prependInner>
            <Icon icon="mdi:dna" class="text-xl" />
          </template>
        </va-select>
        </div>


      </va-form>
    </div>

    <template #footer>
      <div class="flex gap-2 justify-end">
        <va-button preset="secondary" @click="resetForm">
          Reset
        </va-button>
        <va-button preset="primary" @click="applyFilters">
          Apply Filters
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import config from '@/config';
import constants from '@/constants';

const visible = ref(false);

const form = ref({
  name: '',
  project_id: '',
  file_type: null,
  genome_type: null,
  genome_value: null,
});

// Generate file type options from config
const fileTypeOptions = computed(() => {
  const options = [{ name: 'All', id: null }];
  config.trackFileTypes.forEach(fileType => {
    options.push(fileType);
  });
  return options;
});

// Generate genome type options from constants
const genomeTypeOptions = computed(() => {
  const options = [{ name: 'All', id: null }];
  Object.keys(constants.GENOME_TYPES).forEach(type => {
    options.push({ name: type.charAt(0).toUpperCase() + type.slice(1), id: type });
  });
  return options;
});

// Generate genome value options based on selected genome type
const genomeValueOptions = computed(() => {
  const options = [{ name: 'All', id: null }];
  if (form.value.genome_type && constants.GENOME_TYPES[form.value.genome_type]) {
    constants.GENOME_TYPES[form.value.genome_type].genomes.forEach(genome => {
      options.push({ name: genome, id: genome });
    });
  }
  return options;
});

// Initialize form with current filters
const initializeForm = () => {
  form.value = {
    name: '',
    project_id: '',
    file_type: null,
    genome_type: null,
    genome_value: null,
  };
};

// Watch for modal visibility changes
watch(visible, (newValue) => {
  if (newValue) {
    initializeForm();
  }
});

const emit = defineEmits(['search']);

function applyFilters() {
  // Emit filters to parent component
  const filters = {
    name: form.value.name || null,
    project_id: form.value.project_id || null,
    file_type: form.value.file_type,
    genome_type: form.value.genome_type,
    genome_value: form.value.genome_value,
  };

  visible.value = false;
  emit('search', filters);
}

function resetForm() {
  form.value = {
    name: '',
    project_id: '',
    file_type: null,
    genome_type: null,
    genome_value: null,
  };
}

// Expose show method
defineExpose({
  show: () => {
    visible.value = true;
  },
});
</script> 