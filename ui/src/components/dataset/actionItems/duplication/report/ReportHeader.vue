<template>
  <va-card>
    <va-card-title class="mt-1">
      <span class="text-lg" :data-testid="`${TEST_ID_PREFIX}-info`">Info</span>
    </va-card-title>

    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table">
          <tbody>
            <tr :data-testid="`${TEST_ID_PREFIX}-name`">
              <td>Dataset Name</td>
              <td>
                {{ props.actionItem.dataset.name }}
              </td>
            </tr>

            <tr :data-testid="`${TEST_ID_PREFIX}-original-dataset-id`">
              <td>Original Dataset</td>
              <td>
                <router-link
                  :to="`/datasets/${props.actionItem.metadata.original_dataset_id}`"
                  class="va-link"
                >
                  #{{ props.actionItem.metadata.original_dataset_id }}
                </router-link>
              </td>
            </tr>

            <tr :data-testid="`${TEST_ID_PREFIX}-duplicate-dataset-id`">
              <td>Duplicate Dataset</td>
              <td>
                <router-link
                  :to="`/datasets/${props.actionItem.dataset_id}`"
                  class="va-link"
                >
                  #{{ props.actionItem.dataset_id }}
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
const props = defineProps({
  actionItem: { type: Object, required: true },
});

const TEST_ID_PREFIX = "dataset-duplication-report";
</script>

<style scoped></style>
