<template>
  <div>
    <div
      v-if="
        isActiveDatasetWithIncomingDuplicates(props.dataset) && isAuthorized
      "
    >
      <va-alert
        v-for="(duplicateDataset, index) in duplicateDatasets"
        color="warning"
        :key="index"
        :class="index < duplicateDatasets.length ? 'mb-2' : ''"
      >
        <div class="flex items-center">
          <div class="flex-auto">
            This dataset has been duplicated by
            <a :href="`/datasets/${duplicateDataset.id}`">
              #{{ duplicateDataset.id }}
            </a>
          </div>

          <!-- Allow authorized users to see visit the action item for this duplication -->
          <va-button
            v-if="duplicateDataset.action_items.length > 0"
            @click="
              () => {
                router.push(
                  `/datasets/${duplicateDataset.id}/actionItems/${duplicateDataset.action_items[0].id}`,
                );
              }
            "
          >
            Accept/Reject duplicate
          </va-button>
        </div>
      </va-alert>
    </div>
  </div>
</template>

<script setup>
import { isActiveDatasetWithIncomingDuplicates } from "@/services/datasetUtils";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();

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

// Gather and sort all duplicates of the current dataset
const duplicateDatasets = computed(() =>
  gatherDatasetDuplicates(props.dataset),
);

const gatherDatasetDuplicates = (dataset) =>
  (dataset?.duplicated_by || [])
    .filter(
      (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_deleted,
    )
    .map((duplicationRecord) => duplicationRecord.duplicate_dataset)
    // sort duplicates by version - most recent version first
    .sort((duplicate1, duplicate2) => duplicate2.version - duplicate1.version);
</script>
