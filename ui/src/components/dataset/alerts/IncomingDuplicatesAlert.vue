<template>
  <va-alert
    v-if="isActiveDatasetWithIncomingDuplicates(props.dataset)"
    color="warning"
  >
    <div class="flex items-center">
      <div class="flex-auto">This dataset has incoming duplicates.</div>
    </div>

    <va-button
      @click="
        () => {
          router.push(`/datasets/${dataset.id}`);
        }
      "
    >
      Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
    </va-button>
  </va-alert>

  <OverwriteInProgressAlert :dataset="dataset" />
</template>

<script setup>
import { isActiveDatasetWithIncomingDuplicates } from "@/services/utils";

const router = useRouter();
const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});
</script>

<style scoped></style>
