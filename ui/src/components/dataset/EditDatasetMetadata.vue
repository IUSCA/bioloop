<script setup>
import DatasetService from "@/services/dataset";
import AddEditButton from "../utils/buttons/AddEditButton.vue";
import EditDatasetMetadataField from "./EditDatasetMetadataField.vue";
const { metadata, id } = defineProps({ metadata: Object, id: Number });

const emit = defineEmits(['update']);

const metadataField = ref({});

const options = ref([]);
const availableOptions = computed(() => options.value
  .filter(o => !metadata.find(m => m.keyword_id === o.id))
  .map(o => toRaw(o))
);


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
      if (options.value.find(o => o.id === metadata[key]['keyword_id']).datatype === 'DATE') {
        metaRows.value.push({
          keyword_id: metadata[key]['keyword_id'],
          data: isNaN(new Date(metadata[key]['value'])) ? new Date() : new Date(metadata[key]['value'])
        });
      } else {
        metaRows.value.push({ keyword_id: metadata[key]['keyword_id'], data: metadata[key]['value'] });
      }
    });
  }
});



const getFields = async () => {
  const results = await DatasetService.get_metadata_fields();
  options.value = results.data;

  // console.log("OPTIONS", options.value);
};

const create = ref(false);

const changeView = () => {
  create.value = !create.value;
  title.value = create.value ? 'Create Metadata Field' : 'Metadata';
};

const saveMetadata = async () => {

  // console.log('DATA', metaRows.value)
  await DatasetService.save_metadata({ id, metadata: metaRows.value });
  emit('update');
};

const editMetadataField = async (field) => {
  // console.log(field)
  title.value = 'Edit Metadata Field';
  metadataField.value = field;
  create.value = true;

};

const createMetaDataField = async () => {
  title.value = 'Create Metadata Field';
  metadataField.value = {};
  create.value = true;
};

const title = ref('Metadata');


const checkDataType = (id, type) => options.value.find(o => o.id === id).datatype === type;

const updatedField = () => {
  console.log('UPDATED');
  getFields();
  title.value = 'Metadata';
  create.value = false;
};
</script>

<template>
  <div class="flex flex-col">

    <div class="flex justify-between mb-2">
      <h1 class="text-2xl">{{ title }}</h1>

      <va-button v-if="!create" @click="createMetaDataField"><va-icon name="add" class="pr-1" />Create Metadata
        Field</va-button>
      <va-button v-else @click="changeView"><va-icon name="reply" class="pr-1" /> Back</va-button>
    </div>
    <div v-if="create">
      <EditDatasetMetadataField v-if="create" :metadata="metadataField" @update="updatedField" />
    </div>

    <div class="flex flex-col gap-3" v-else>
      <div v-for="(row, index) in metaRows" :key="index" class="flex justify-between">


        <va-select v-if="!row.keyword_id" v-model="row.keyword_id" :label="`Metadata Field`" :options="availableOptions"
          text-by="name" value-by="id" placeholder="Choose a value" class="mr-2" />

        <div v-else  class="my-2 w-64 mr-2 pt-3 font-bold text-base" >
          {{ options.find(o => o.id === row.keyword_id).name }}
        </div>

        <AddEditButton v-if="row.keyword_id" edit @click="editMetadataField(options.find(o => o.id === row.keyword_id))"
          class="mr-2 h-2 mt-4" />




        <va-input  v-model="row.data" :label="`Data`" placeholder="Enter data" />



        <va-button class="mx-2 h-2 mt-4" round color="danger" border-color="danger" preset="secondary"
          @click="removeMetaRow(index)">X</va-button>
      </div>
      <va-button @click="addMetaRow" class="mt-2" round color="success" border-color="success"
        preset="secondary"><va-icon name="add" class="pr-1" />Add Row</va-button>
      <va-button @click="saveMetadata" class="w-full"><va-icon name="save" class="pr-1" />Save</va-button>
    </div>

  </div>
</template>