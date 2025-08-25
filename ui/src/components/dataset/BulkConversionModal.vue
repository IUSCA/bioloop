<template>
  <va-modal
    :model-value="visible"
    title="Bulk Conversion"
    fixed-layout
    hide-default-actions
  >
    <va-inner-loading :loading="loading" class="h-full">
      <div class="min-h-[calc(100vh-15rem)]">
        <ConversionForm
          v-if="results === null"
          v-model:definition="definition"
          v-model:argValues="argValues"
        />

        <!-- results -->
        <div v-else>
          <!-- show number of conversions succeeded -->
          <div class="mb-4">
            <p class="text-lg">
              {{ results.success_count }} out of {{ num_datasets }} conversions
              successfully initiated
            </p>
          </div>

          <!-- Show failed datasets and their reasons (name and message) -->
          <div v-if="results?.failures?.length > 0">
            <p class="text-lg">Failed conversions:</p>
            <ul>
              <li v-for="failure in results.failures" :key="failure.dataset_id">
                <p>
                  <strong> Dataset #{{ failure.dataset_id }} </strong>:
                  {{ failure.reason.name }} -
                  {{ failure.reason.message }}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <!-- actions -->
      <div class="flex justify-end items-center gap-3">
        <va-button @click="close" variant="secondary">Close</va-button>
        <va-button
          v-if="results === null"
          @click="convert_datasets"
          variant="primary"
          :disabled="!definition || argValues.length === 0"
        >
          Convert {{ num_datasets }} Datasets
        </va-button>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import conversionService from "@/services/conversions";
import toast from "@/services/toast";
const props = defineProps({
  datasetIds: { type: Array, required: true },
});

const emit = defineEmits(["done"]);

defineExpose({
  show,
  hide,
});

const visible = ref(false);
const loading = ref(false);
const definition = ref();
const argValues = ref([]);
const results = ref(null);

const num_datasets = computed(() => props.datasetIds?.length || 0);

function hide() {
  visible.value = false;
}

function show() {
  visible.value = true;
}

function convert_datasets() {
  loading.value = true;
  conversionService
    .createBulk({
      definition_id: definition.value.id,
      dataset_ids: props.datasetIds,
      argument_values: removeNullValues(argValues.value.argument_values),
      user_argument_values: argValues.value.user_argument_values,
    })
    .then((res) => {
      // res.data: type: {dataset_id: [status, conversion_object | {name, message}]}
      //   {
      // "10": [
      //     false,
      //     {
      //         "name": "BadRequestError",
      //         "message": "Missing required arguments"
      //     }
      // ],
      // "14": [
      //     true,
      //     {
      //         "id": 7,
      //         "initiated_at": "2024-09-25T03:58:46.562Z",
      //         "definition_id": 1,
      //         "workflow_id": "c5ba9acd-5d6c-4473-a6f5-63ee6ce37bdd",
      //         "dataset_id": 14,
      //         "initiator_id": 4
      //     }
      // ],
      // "22": [
      //     true,
      //     {
      //         "id": 6,
      //         "initiated_at": "2024-09-25T03:58:46.510Z",
      //         "definition_id": 1,
      //         "workflow_id": "62a08eae-b8cd-4f36-93e7-7544ae6ca984",
      //         "dataset_id": 22,
      //         "initiator_id": 4
      //     }
      // ],
      // "23": [
      //     false,
      //     {
      //         "name": "BadRequestError",
      //         "message": "Missing required arguments"
      //     }
      // ],
      // "24": [
      //     true,
      //     {
      //         "id": 8,
      //         "initiated_at": "2024-09-25T03:58:46.578Z",
      //         "definition_id": 1,
      //         "workflow_id": "fd57498c-bd82-45a9-80e1-1f53a5ddec44",
      //         "dataset_id": 24,
      //         "initiator_id": 4
      //     }
      // ]
      // }
      // status: true if conversion was successful, false otherwise
      const success_count = Object.values(res.data).filter((v) => v[0]).length;

      // failures: [[dataset_id, {name, message}]]
      const failures = Object.entries(res.data)
        .filter(([, v]) => !v[0])
        .map(([k, v]) => ({
          dataset_id: k,
          reason: v[1],
        }))
        .sort((a, b) => {
          // sort by error name
          const a_error_name = a.reason.name;
          const b_error_name = b.reason.name;
          return a_error_name.localeCompare(b_error_name);
        });

      results.value = { success_count, failures };
    })
    .catch((err) => {
      console.error(err);
      toast.error("Failed to convert datasets");
      if (err.response.data) {
        toast.error(err.response.data.message);
      }
    })
    .finally(() => {
      loading.value = false;
    });
}

function removeNullValues(argValues) {
  return argValues.filter(arg => arg.value != null);
}

function close() {
  visible.value = false;
  definition.value = null;
  argValues.value = [];
  results.value = null;
  emit("done");
}
</script>

