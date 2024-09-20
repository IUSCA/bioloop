<script setup>
import DatasetService from '@/services/dataset';
const { metadata } = defineProps({ metadata: Object });

console.log(metadata);

// emits
const emit = defineEmits(['update']);

const createField = async () => {

  if(metadata['id']) {
    await DatasetService.update_metadata_field(metadata);
  } else {
    await DatasetService.create_metadata_field(metadata);
  }
  emit('update');
};


const types = ['STRING', 'NUMBER', 'DATE', 'BOOLEAN'];
</script>

<template>

  <div class="w-full flex flex-col items-baseline gap-4">
    <va-input v-model="metadata['name']" label="Name" class="w-full" />
    <va-textarea v-model="metadata['description']" label="Description" class="w-full" />
    <va-select v-model="metadata['datatype']" label="Type" :options="types" text-by="name" value-by="id" class="w-full" />
    <va-switch v-model="metadata['visible']" label="Visible" class="w-full" />
    <va-switch v-model="metadata['locked']" label="Locked" class="w-full" />

    <va-button @click="createField" class="w-full"><va-icon name="save" class="pr-1" />Save</va-button>
  </div>
</template>