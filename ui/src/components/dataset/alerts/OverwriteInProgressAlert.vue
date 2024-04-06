<template>
  <!--
   Shows important alerts regarding the dataset's state.

   Alerts are generated if this dataset is in either of the following states:
   1. Dataset is active and has been duplicated by another dataset.
   -->

  <!-- First, handle cases where current dataset is active (not deleted) -->

  <!-- The current dataset is an active dataset which has incoming duplicates -->

  <!-- The current dataset is an active dataset which is currently being overwritten by its duplicate. -->
  <va-alert v-if="isActiveDatasetBeingOverwritten" color="warning">
    This dataset is currently being overwritten by duplicate
    <a :href="`/datasets/${overwrittenByDatasetId(props.dataset)}`">
      #{{ overwrittenByDatasetId(props.dataset) }}
    </a>
  </va-alert>
</template>

<script setup>
import { isDatasetBeingOverwritten } from "@/services/utils";

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

// Gather and sort all duplicates of the current dataset

// whether this dataset was duplicated by another, and is currently undergoing
// the process of being replaced by its duplicate.
const isActiveDatasetBeingOverwritten = computed(() => {
  return isDatasetBeingOverwritten(props.dataset);
});

// Returns the dataset that overwrote the current
// dataset (via acceptance of a duplicate into the system)
const overwrittenByDatasetId = (dataset) => {
  if (!dataset || !dataset.duplicated_by) {
    return undefined;
  }

  // When a dataset overwrites another, it's `is_duplicate` is changed from
  // `true` to `false`
  const duplicationLog = (dataset.duplicated_by || []).find(
    (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
  );

  return duplicationLog ? duplicationLog.duplicate_dataset.id : undefined;
};
</script>
