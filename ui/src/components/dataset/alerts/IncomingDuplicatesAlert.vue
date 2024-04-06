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
              router.push(`/datasets/${props.dataset.id}`);
            }
          "
        >
          Review
        </va-button>
      </div>
    </div>
  </va-alert>

  <OverwriteInProgressAlert :dataset="props.dataset" />
</template>

<script setup>
import { isActiveDatasetWithIncomingDuplicates } from "@/services/utils";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const auth = useAuthStore();
</script>
