<template>
  <!-- This dataset has duplicates incoming -->
  <va-alert
    v-if="isActiveDatasetWithIncomingDuplicates(props.dataset) && isAuthorized"
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
</template>

<script setup>
import { isActiveDatasetWithIncomingDuplicates } from "@/services/datasetUtils";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const router = useRouter();
const auth = useAuthStore();

const isAuthorized = computed(
  () => auth.canAdmin.value || auth.canOperate.value,
);
</script>
