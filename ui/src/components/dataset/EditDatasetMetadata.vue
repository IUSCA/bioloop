<script setup>
import DatasetService from "@/services/dataset";
const { metadata, id } = defineProps({ metadata: Object, id: Number });

const newMetadata = ref({});

const options = ref([]);
const metaRows = ref([{ keyword_id: '', data: '' }]);

function addMetaRow() {
  metaRows.value.push({ keyword_id: '', data: '' });
}

function removeMetaRow(index) {
  metaRows.value.splice(index, 1);
}

onMounted(async () => {
  await getFields();
  if (Object.keys(metadata).length !== 0) {
    metaRows.value = [];
    const keys = Object.keys(metadata);

    keys.forEach((key) => {
      metaRows.value.push({ keyword_id: metadata[key]['keyword_id'], data: metadata[key]['value'] });
    });
  }
});

const getFields = async () => {
  const results = await DatasetService.get_metadata_fields();
  options.value = results.data;

  // console.log("OPTIONS", options.value);
};

const create = ref(false);
const createField = async () => {
  // console.log(newMetadata.value);
  await DatasetService.create_metadata_field(newMetadata.value);
  create.value = false;
  getFields();
};

const changeView = () => {
  create.value = !create.value;
  title.value = create.value ? 'Create Metadata Field' : 'Metadata';
};

const saveMetadata = async () => {

  // console.log('DATA', metaRows.value)
  await DatasetService.save_metadata({ id, metadata: metaRows.value });
};

const title = ref('Metadata');
</script>

<template>
  <div class="flex flex-col">
    <!-- <va-button @click="create = !create" >Edit Metadata</va-button> -->
    <div class="flex justify-between mb-2">
      <h1 class="text-2xl">{{ title }}</h1>

      <va-button v-if="!create" @click="changeView"><va-icon name="add" class="pr-1" />Create Metadata Field</va-button>
      <va-button v-else @click="changeView"><va-icon name="reply" class="pr-1" /> Back</va-button>
    </div>
    <div v-if="create">
      <div class="w-full flex flex-col items-baseline gap-4">
        <va-input v-model="newMetadata['name']" label="Name" class="w-full" />
        <va-textarea v-model="newMetadata['description']" label="Description" class="w-full" />

      <va-button @click="createField" class="w-full"><va-icon name="save" class="pr-1" />Save</va-button>
    </div>
    </div>

    <div class="flex flex-col gap-3" v-else>
      <div v-for="(row, index) in metaRows" :key="index" class="flex justify-between">

        <va-select v-model="row.keyword_id" :label="`Metadata Field`" :options="options" text-by="name" value-by="id" placeholder="Choose a value" class="mr-2" />
          

        <va-input v-model="row.data" :label="`Data`" placeholder="Enter data" />
        <va-button class="mx-2 h-2 mt-4" round color="danger" border-color="danger" preset="secondary" @click="removeMetaRow(index)">X</va-button>
      </div>
      <va-button @click="addMetaRow" class="mt-2" round color="success" border-color="success" preset="secondary" ><va-icon name="add" class="pr-1" />Add Row</va-button>
      <va-button @click="saveMetadata" class="w-full"><va-icon name="save" class="pr-1" />Save</va-button>
    </div>

  </div>
</template>