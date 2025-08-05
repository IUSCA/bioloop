<template>
  <va-modal
    v-model="visible"
    title="Search Sessions"
    fixed-layout
    hide-default-actions
    size="medium"
    okText="Apply"
    cancelText="Reset"
    @ok="handleApply"
    @cancel="handleReset"
  >
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Title filter -->
      <va-input
        v-model="form.title"
        label="Title"
        placeholder="Search by session title"
      />

      <!-- Genome filter -->
      <va-input
        v-model="form.genome"
        label="Genome"
        placeholder="e.g., hg38, mm10"
      />

      <!-- Genome Type filter -->
      <va-select
        v-model="form.genome_type"
        label="Genome Type"
        placeholder="Select genome type"
        :options="genomeTypeOptions"
        clearable
      />
    </div>
  </va-modal>
</template>

<script setup>
import constants from '@/constants';
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  filters: { type: Object, required: true },
});

const emit = defineEmits(['update:modelValue', 'apply', 'reset']);

// Reactive state
const visible = ref(false);
const form = ref({
  title: '',
  genome: '',
  genome_type: '',
});

// Computed
const genomeTypeOptions = computed(() => {
  return Object.keys(constants.GENOME_TYPES).map(type => ({
    text: type.charAt(0).toUpperCase() + type.slice(1),
    value: type,
  }));
});

// Watchers
watch(() => props.modelValue, (newValue) => {
  visible.value = newValue;
  if (newValue) {
    initializeForm();
  }
});

watch(visible, (newValue) => {
  emit('update:modelValue', newValue);
});

// Methods
const initializeForm = () => {
  form.value = {
    title: props.filters.title || '',
    genome: props.filters.genome || '',
    genome_type: props.filters.genome_type || '',
  };
};

const handleApply = () => {
  emit('apply', { ...form.value });
  visible.value = false;
};

const handleReset = () => {
  form.value = {
    title: '',
    genome: '',
    genome_type: '',
  };
  emit('reset');
  visible.value = false;
};
</script> 