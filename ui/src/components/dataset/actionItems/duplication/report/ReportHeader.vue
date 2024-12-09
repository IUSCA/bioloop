<template>
  <va-card>
    <va-card-title>
      <div class="mt-1">
        <span class="text-lg">Info</span>
      </div>
    </va-card-title>

    <va-card-content>
      <div class="va-table-responsive">
        <table class="va-table">
          <tbody>
            <tr>
              <td>Dataset Name</td>
              <td>
                {{ props.actionItem?.dataset.name }}
              </td>
            </tr>
            <tr>
              <td>Original Dataset</td>
              <td>
                <router-link
                  :to="`/datasets/${props.actionItem?.dataset.duplicated_from.original_dataset_id}`"
                  class="va-link"
                >
                  #{{ props.actionItem?.dataset.duplicated_from.original_dataset_id }}
                </router-link>
              </td>
            </tr>
            <tr>
              <td>Duplicate Dataset</td>
              <td>
                <router-link
                  :to="`/datasets/${props.actionItem?.dataset_id}`"
                  class="va-link"
                >
                  #{{ props.actionItem?.dataset_id }}
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
</script>

<style scoped></style>
