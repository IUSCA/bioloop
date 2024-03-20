<template>
  <div>
    <!--
   Shows important alerts regarding the dataset's state.

   Alerts are generated if this dataset is in either of the following states:
   1. Dataset is active and is a duplicate of another dataset, and is currently pending acceptance into the system.
   2. Dataset is active and has been duplicated by another dataset.
   3. Dataset has been deleted via a soft-delete
   4. Dataset has been deleted on account of being a rejected duplicate of an another dataset.
   5. Dataset has been deleted on account of being overwritten by another dataset (a dataset
   reaches this state once it's duplicate dataset has been accepted into the system).
  -->

    <!-- First, handle cases where current dataset is active (not deleted) -->

    <!-- The current dataset is an active duplicate -->
    <va-alert v-if="isActiveDuplicate" color="warning">
      <div class="flex items-center">
        <div class="flex-auto">
          <div>
            This dataset has been duplicated from
            <a
              :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
            >
              #{{ props.dataset.duplicated_from?.original_dataset_id }}
            </a>
          </div>
        </div>

        <!-- Allow users to see any active action items for this duplication -->
        <va-button
          v-if="props.dataset.action_items.length > 0"
          @click="
            () => {
              // duplicateDataset.action_items[0] is sufficient because exactly one action item is created
              // for a dataset duplication
              router.push(
                `/datasets/${props.dataset.id}/actionItems/${props.dataset.action_items[0].id}`,
              );
            }
          "
        >
          Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
        </va-button>
      </div>
    </va-alert>

    <!-- The current dataset is an active dataset which has incoming duplicates -->
    <div v-if="hasIncomingDuplicates">
      <va-alert
        v-for="(duplicateDataset, index) in duplicateDatasets"
        color="warning"
        :key="index"
        :class="index < duplicateDatasets.length ? 'mb-2' : ''"
      >
        <div class="flex items-center">
          <div class="flex-auto">
            <div>
              This dataset has been duplicated by
              <a :href="`/datasets/${duplicateDataset.id}`">
                #{{ duplicateDataset.id }}
              </a>
            </div>
          </div>

          <!-- Allow users to see visit the action item for this duplication -->
          <va-button
            v-if="duplicateDataset.action_items.length > 0"
            @click="
              () => {
                // duplicateDataset.action_items[0] is sufficient because exactly one action item is created
                // for a dataset duplication
                router.push(
                  `/datasets/${duplicateDataset.id}/actionItems/${duplicateDataset.action_items[0].id}`,
                );
              }
            "
          >
            Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
          </va-button>
        </div>
      </va-alert>
    </div>

    <!-- Now, handle cases where current dataset has been deleted. -->

    <!-- Any of the following states (REJECTED_DUPLICATE, DELETED, OVERWRITTEN) will only be reached once
    the current dataset has been deleted. -->

    <!-- The current dataset is a rejected duplicate of another -->
    <va-alert v-if="datasetState === 'REJECTED_DUPLICATE'" color="danger">
      This dataset is a rejected duplicate of
      <a
        :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
      >
        #{{ props.dataset.duplicated_from?.original_dataset_id }}
      </a>
    </va-alert>

    <!-- The current dataset has been deleted (soft-delete) -->
    <va-alert v-if="datasetState === 'DELETED'" color="danger">
      This dataset has been deleted
    </va-alert>

    <!-- The current dataset has been overwritten by another dataset -->
    <va-alert v-if="datasetState === 'OVERWRITTEN'" color="danger">
      This dataset has been overwritten by duplicate
      <a :href="`/datasets/${overwrittenBy(props.dataset)?.id}`">
        #{{ overwrittenBy(props.dataset)?.id }}
      </a>
    </va-alert>
  </div>
</template>

<script setup>
const router = useRouter();

const props = defineProps({
  dataset: {
    type: Object,
    required: true,
  },
});

// Returns the dataset that overwrote the current dataset
const overwrittenBy = (dataset) => {
  // When a dataset overwrites another, it's `is_duplicate` is changed from `true` to `false`
  return (dataset?.duplicated_by || []).find(
    (duplicationRecord) => !duplicationRecord.duplicate_dataset.is_duplicate,
  ).duplicate_dataset;
};

const gatherDatasetDuplicates = (dataset) =>
  (dataset?.duplicated_by || [])
    .map((duplicationRecord) => duplicationRecord.duplicate_dataset)
    // sort duplicates by version - most recent version first
    .sort((duplicate1, duplicate2) => duplicate2.version - duplicate1.version);

// Gather and sort all duplicates of the current dataset
const duplicateDatasets = computed(() =>
  gatherDatasetDuplicates(props.dataset),
);

const datasetState = computed(() => currentState(props.dataset));

// whether this dataset has incoming duplicates
const hasIncomingDuplicates = computed(
  () =>
    !props.dataset.is_duplicate &&
    !props.dataset.is_deleted &&
    props.dataset.duplicated_by?.length > 0,
);

// whether this dataset is an active (not deleted) duplicate of another
const isActiveDuplicate = computed(
  () => props.dataset.is_duplicate && !props.dataset.is_deleted,
);

const currentState = (dataset) => {
  // assumes states are sorted by descending timestamp
  return (dataset.states || []).length > 0 ? dataset.states[0].state : null;
};
</script>
