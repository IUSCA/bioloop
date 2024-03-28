<template>
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
              router.push(`/datasets/${dataset.id}`);
            }
          "
        >
          Review
        </va-button>
      </div>
    </div>
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
