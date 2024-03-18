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
    <!-- <template #title>
      <div class="text-lg">
        {{ alertConfig.title }}
      </div>
    </template> -->

    <div class="flex flex-col">
      <div>
        {{ alertConfig.text }}
      </div>

      <!-- The current dataset is a duplicate of another dataset.  -->
      <div v-if="alertConfig.alertType === 'IS_DUPLICATE'">
        <div
          >Duplicated From:
          <a :href="`/datasets/${alertConfig.duplicatedFromId}`"> #{{ alertConfig.duplicatedFromId }} </a></div
        >
      </div>

      <!-- The current dataset has been duplicated by other datasets -->
      <div v-if="alertConfig.alertType === 'DUPLICATE_INCOMING'">
        <div
          v-for="(duplicated_by_id, index) in (alertConfig.duplicatedByIds || [])"
          :key="index"
        >
          <span
            >Duplicated By: <a :href="`/datasets/${duplicated_by_id}`"> #{{ duplicated_by_id }} </a></span
          >
        </div>
      </div>

      <!-- The current dataset is a rejected duplicate of an another dataset -->
      <div v-if="alertConfig.alertType === 'REJECTED_DUPLICATE'">
        <span
          >Duplicated From:
          <a :href="`/datasets/${alertConfig.duplicatedFromId}`"> #{{ alertConfig.duplicatedFromId }} </a></span
        >
      </div>

      <!-- The current dataset has been overwritten by another dataset -->
      <div v-if="alertConfig.alertType === 'OVERWRITTEN'">
        <span
          >Overwritten by:
          <a :href="`/datasets/${alertConfig.duplicated_by_id}`"> #{{ alertConfig.duplicated_by_id }} </a></span
        >
      </div>
    </div>
  </va-alert>
</template>

<script setup>
import dayjs from "dayjs";

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const alertConfig = computed(() => {
  const dataset = props.dataset;

  if (Object.values(dataset).length === 0) {
    return {}
  }

  let duplicatedFromId = dataset.duplicated_from?.original_dataset_id;
  let duplicatedByIds = (dataset.duplicated_by || [])
    .map(duplicationRecord => duplicationRecord.duplicate_dataset)
    // sort duplicates by version - most recent version first
    .sort((duplicate1, duplicate2) =>
      dayjs(duplicate2.version).diff(dayjs(duplicate1.version)),
    )
    .map((duplicate) => duplicate.id);

  let title = "";
  let alertColor = "";
  let text = "";
  let alertType = "";

  console.log("determining alertConfig")
  console.dir(dataset, {depth: null})

  if (dataset.is_duplicate) {
    // if dataset is a duplicate of another,
    alertType = "IS_DUPLICATE";
    alertColor = "warning";
    title = "Duplicate Dataset";
    text = `This dataset has been duplicated from another, and is currently pending acceptance.`;
  } else {
    if (!dataset.is_deleted) {
      // if dataset is active in the system,
      if (dataset.duplicated_by?.length > 0) {
        // and it has been duplicated by other datasets.
        alertType = "DUPLICATE_INCOMING";
        alertColor = "warning";
        title = "Duplicate Dataset Incoming";
        text =
          `This dataset has been duplicated by ${duplicatedByIds.length === 1 ? "another" : "others"},` +
          ` which ${duplicatedByIds.length === 1 ? "is" : "are"} currently pending acceptance.`;
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
    duplicatedFromId,
    duplicatedByIds,
    overwrittenById: "",
  };
});

const currentState = (dataset) => {
  const latestState = dataset.states[dataset.states.length - 1];
  return latestState.state;
};
</script>
