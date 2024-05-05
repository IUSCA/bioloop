<template>
  <!-- The current dataset is an active dataset which is currently being overwritten by its duplicate. -->
  <va-alert
    v-if="isActiveDatasetBeingOverwritten && isAuthorized"
    color="warning"
  >
    This dataset is currently being overwritten by duplicate
    <a :href="`/datasets/${_overwrittenByDatasetId}`">
      #{{ _overwrittenByDatasetId }}
    </a>
  </va-alert>
</template>

<script setup>
import {
  isDatasetBeingOverwritten,
  overwrittenByDatasetId,
} from "@/services/datasetUtils";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const auth = useAuthStore();

const isAuthorized = computed(
  () => auth.canAdmin.value || auth.canOperate.value,
);

const _overwrittenByDatasetId = computed(() =>
  overwrittenByDatasetId(props.dataset),
);

// whether this dataset was duplicated by another, and is currently undergoing
// the process of being replaced by its duplicate.
const isActiveDatasetBeingOverwritten = computed(() => {
  return isDatasetBeingOverwritten(props.dataset);
});
</script>
