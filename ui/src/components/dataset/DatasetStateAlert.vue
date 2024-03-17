<template>
  <va-alert :color="alertConfig.color">
    <template #title>
      <div class="va-title">
        {{ alertConfig.title }}
      </div>
    </template>

    <div class="flex flex-col">
      <div>
        {{ alertConfig.text }}
      </div>
      <div>
        <span
          >Duplicated From:
          <a href="#"> #{{ alertConfig.duplicated_from_id }} </a></span
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

const _dataset = toRef(() => props.dataset);

console.log("LOADED");

const alertConfig = computed(() => {
  const dataset = props.dataset;

  let duplicated_from_id = dataset.duplicated_from?.original_dataset_id;
  let duplicated_by_id = dataset.duplicated_by?.duplicate_dataset_id;
  let color = "";
  let text = "";
  let title = "";

  if (dataset.type === "DUPLICATE") {
    color = "warning";
    title = "DUPLICATE DATASET";
    text = `This dataset was duplicated from another, and is currently pending acceptance.`;
  } else {
    if (!dataset.is_deleted) {
      if (dataset.duplicated_by) {
        color = "warning";
        title = "INCOMING DUPLICATE";
        text = `This dataset was duplicated, which is currently pending acceptance.`;
      }
    } else {
      const datasetState = getCurrentState(dataset);
      if (datasetState === "DELETED") {
        color = "danger";
        text = "You are viewing an inactive (deleted) dataset.";
        title = "INACTIVE DATASET";
      } else if (datasetState === "REJECTED_DUPLICATE") {
        color = "warning";
        title = "REJECTED DUPLICATE";
        text = `This dataset was duplicated from ${dataset.duplicated_from.original_dataset_id}, and then rejected.`;
      } else if (datasetState === "OVERWRITTEN") {
        color = "warning";
        title = "OVERWRITTEN";
        text = `This dataset has been overwritten by ${dataset.duplicated_by.duplicate_dataset_id}.`;
      }
    }
  }

  return {
    color,
    text,
    title,
    duplicated_from_id,
    duplicated_by_id,
  };
  // const dataset = props.dataset.type === 'DUPLICATE'
});

const getCurrentState = (dataset) => {
  const latestState = dataset.states[dataset.states.length - 1];
  return latestState.state;
};
</script>
