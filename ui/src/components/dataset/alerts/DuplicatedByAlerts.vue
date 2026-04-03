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
        :data-testid="`duplicated-by-alert-${duplicateDataset.id}`"
      >
        <div class="flex items-center">
          <div class="flex-auto">
            This dataset has been duplicated by
            <a :href="`/datasets/${duplicateDataset.id}`">
              {{ duplicateDataset.name || `dataset ${duplicateDataset.id}` }}
            </a>
          </div>

          <!-- Allow authorized users to navigate to the duplication report -->
          <va-button
            :data-testid="`duplicated-by-accept-reject-btn-${duplicateDataset.id}`"
            @click="router.push(`/datasets/${duplicateDataset.id}/duplication`)"
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
import { storeToRefs } from "pinia";

const router = useRouter();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

const { canAdmin, canOperate } = storeToRefs(useAuthStore());

const isAuthorized = computed(() => canAdmin.value || canOperate.value);

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
    // sort by creation time — most recently registered duplicate first
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
</script>
