<template>
  <div class="genome-selector">
    <va-select
      v-model="selectedType"
      :options="genomeTypeOptions"
      label="Genome Type"
      placeholder="Select genome type"
      class="mb-4"
      prepend-icon="mdi-dna"
    />
    
    <va-select
      v-if="selectedType"
      v-model="selectedGenome"
      :options="genomeOptions"
      label="Genome Version"
      placeholder="Select genome version"
      prepend-icon="mdi-dna"
      @update:model-value="updateGenome"
    />
  </div>
</template>

<script setup>
import { GENOME_TYPES } from '@/constants'
import { computed, ref, watch } from 'vue'

// Props
const props = defineProps({
  type: {
    type: String,
    default: '',
  },
  genome: {
    type: String,
    default: '',
  },
})

// Emits
const emit = defineEmits(['genomeSelected'])

// Reactive data
const selectedType = ref('')
const selectedGenome = ref('')

// Computed properties
const genomeTypeOptions = computed(() => {
  return Object.entries(GENOME_TYPES).map(([key, data]) => ({
    text: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize first letter
    value: key,
  }))
})

const genomeOptions = computed(() => {
  if (!selectedType.value) return []
  
  return GENOME_TYPES[selectedType.value]?.genomes.map(genome => ({
    text: genome,
    value: genome,
  })) || []
})

// Methods
const updateGenome = () => {
  if (selectedType.value && selectedGenome.value) {
    emit('genomeSelected', selectedType.value, selectedGenome.value)
  }
}

// Watchers
watch(() => props.type, (newType) => {
  if (newType && newType !== selectedType.value) {
    selectedType.value = newType
  }
}, { immediate: true })

watch(() => props.genome, (newGenome) => {
  if (newGenome && newGenome !== selectedGenome.value) {
    selectedGenome.value = newGenome
  }
}, { immediate: true })

// Initialize from props
if (props.type) {
  selectedType.value = props.type
}
if (props.genome) {
  selectedGenome.value = props.genome
}
</script>

<style scoped>
.genome-selector {
  width: 100%;
}
</style> 