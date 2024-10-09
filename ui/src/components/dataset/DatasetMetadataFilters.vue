<script setup>
import DatasetService from "@/services/dataset";
import { useDatasetStore } from "@/stores/dataset";

const emit = defineEmits(["updateMetaData"]);

const store = useDatasetStore();

const metaData = ref({});
const form = ref({});


onMounted(async () => {
  const results = await DatasetService.get_all_metadata(store.type);
  console.log(results.data)
  metaData.value = results.data;


  // Set default values for each metadata
  for(const meta of Object.keys(metaData.value)) {
     if(meta in store.filters['metaData']) {
      console.log('meta', meta);
      form.value[meta] = store.filters['metaData'][meta];
    } else {
      form.value[meta] = { op: '', data: '' }
    }
  }
});

watch(form, () => {
  let tempForm = {...form.value};

  console.log(tempForm)
  // Remove empty values
  // if(!('metaData' in tempForm)) {
  //   return;                              
  // }
  for(const meta of Object.keys(tempForm)) {
    
    if(meta in tempForm && 'data' in tempForm[meta] && tempForm[meta]['data'] === '') {
      delete tempForm[meta];
    }
  }

  console.log('tempForm', tempForm);

  emit('updateMetaData', tempForm);
}, { deep: true });


</script>

<template>
  <div class="w-full">
    <div v-for="meta in Object.keys(metaData)" class='flex flex-col'>
      <VaChip outline class="my-2">
        {{ meta }}
      </VaChip>

      <!-- Query builder based on type -->
      <div v-if="metaData[meta][0].keyword?.datatype === 'NUMBER'">

        <va-select v-model="form[meta]['op']" :options="['>', '<', '>=', '<=', '=']" />
        <va-input v-model="form[meta]['data']"  />
      </div>

      <div v-else-if="metaData[meta][0].keyword?.datatype === 'STRING'">
        <va-select v-model="form[meta]['data']" :options="metaData[meta]"  text-by="value" />
      </div>

      <div v-else-if="metaData[meta][0].keyword?.datatype === 'DATE'">
        <va-date-picker v-model="form[meta]['data']" />
      </div>

      <div v-else-if="metaData[meta][0].keyword?.datatype === 'BOOLEAN'">
        <va-switch v-model="form[meta]['data']" />
      </div>

    </div>
  </div>
</template>