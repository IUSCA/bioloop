<template>
  <!--
   Shows important alerts regarding the dataset's state.

   Alerts are generated if this dataset is in either of the following states:
   1. Dataset has been deleted.
   2. Dataset has been duplicated by another dataset.
   3. Dataset is a duplicate of another dataset, and is currently pending acceptance into the system.
   4. Dataset is a rejected duplicate of an another dataset.
   5. Dataset has been overwritten by another dataset (a dataset reaches this state once it's
      duplicate dataset has been accepted into the system).
  -->

  <va-alert :color="alertConfig.alertColor">
    <template #title>
      <div class="va-title">
        {{ alertConfig.title }}
      </div>
    </template>

    <div class="flex flex-col">
      <div>
        {{ alertConfig.text }}
      </div>

      <!-- The current dataset is a duplicate of another dataset.  -->
      <div v-if="alertConfig.alertType === 'IS_DUPLICATE'">
        <span
          >Duplicated From:
          <a href="#"> #{{ alertConfig.duplicated_from_id }} </a></span
        >
      </div>

      <!-- The current dataset has been duplicated by another dataset -->
      <div v-if="alertConfig.alertType === 'INCOMING_DUPLICATE'">
        <span
          >Duplicated By:
          <a href="#"> #{{ alertConfig.duplicated_by_id }} </a></span
        >
      </div>

      <!-- The current dataset is a rejected duplicate of an another dataset -->
      <div v-if="alertConfig.alertType === 'REJECTED_DUPLICATE'">
        <span
          >Duplicated From:
          <a href="#"> #{{ alertConfig.duplicated_from_id }} </a></span
        >
      </div>

      <!-- The current dataset has been overwritten by another dataset -->
      <div v-if="alertConfig.alertType === 'OVERWRITTEN'">
        <span
          >Overwritten by:
          <a href="#"> #{{ alertConfig.duplicated_by_id }} </a></span
        >
      </div>
    </div>
  </va-alert>
</template>

<script setup>
const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const alertConfig = computed(() => {
  const dataset = props.dataset;

  let duplicated_from_id = dataset.duplicated_from?.original_dataset_id;
  let duplicated_by_id = dataset.duplicated_by?.duplicate_dataset_id;
  let title = "";
  let alertColor = "";
  let text = "";
  let alertType = "";

  if (dataset.type === "DUPLICATE") {
    // if dataset is a duplicate of another,
    alertType = "IS_DUPLICATE";
    alertColor = "warning";
    title = "Duplicate Dataset";
    text = `This dataset has been duplicated from another, and is currently pending acceptance.`;
  } else {
    if (!dataset.is_deleted) {
      // if dataset is active in the system,
      if (dataset.duplicated_by) {
        // and it has been duplicated by another dataset.
        alertType = "INCOMING_DUPLICATE";
        alertColor = "warning";
        title = "Incoming Duplicate";
        text = `This dataset has been duplicated by another, which is currently pending acceptance.`;
      }
    } else {
      // dataset has reached one of 3 potential deleted states:
      const datasetState = currentState(dataset);
      if (datasetState === "DELETED") {
        // either dataset has been soft-deleted,
        alertType = "INACTIVE_DATASET";
        alertColor = "danger";
        title = "Inactive Dataset";
        text = "You are viewing an inactive (deleted) dataset.";
      } else if (datasetState === "REJECTED_DUPLICATE") {
        // or, dataset is a duplicate which has been rejected from being ingested into the system
        alertType = "REJECTED_DUPLICATE";
        alertColor = "warning";
        title = "Rejected Duplicate";
        text = `This dataset is a duplicate, and has been rejected from being ingested into the system.`;
      } else if (datasetState === "OVERWRITTEN") {
        // or, dataset has been overwritten by another dataset.
        alertType = "OVERWRITTEN";
        alertColor = "warning";
        title = "Overwritten";
        text = `This dataset has been overwritten by another.`;
      }
    }
  }

  return {
    alertColor,
    text,
    title,
    alertType,
    duplicated_from_id,
    duplicated_by_id,
  };
});

const currentState = (dataset) => {
  const latestState = dataset.states[dataset.states.length - 1];
  return latestState.state;
};
</script>
