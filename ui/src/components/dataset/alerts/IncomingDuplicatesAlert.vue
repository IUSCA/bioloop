<template>
  <!-- This dataset has duplicates incoming -->
  <va-alert
    v-if="isActiveDatasetWithIncomingDuplicates(props.dataset)"
    color="warning"
  >
    <div class="flex items-center">
      <div class="flex-auto">This dataset has incoming duplicates.</div>

      <div class="flex-none">
        <va-button
          @click="
            () => {
              router.push(`/datasets/${props.dataset.id}`);
            }
          "
        >
          Review
        </va-button>
      </div>
    </div>
  </va-alert>

  <!-- This dataset is currently being overwritten by a duplicate -->
  <OverwriteInProgressAlert :dataset="props.dataset" />
</template>

<script setup>
import { isActiveDatasetWithIncomingDuplicates } from "@/services/datasetUtils";

const router = useRouter();
const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});
</script>
