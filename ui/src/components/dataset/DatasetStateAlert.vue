<template>
  <div>
    <!--
   Shows important alerts regarding the dataset's state.

   Alerts are generated if this dataset is in either of the following states:
   1. Dataset has been deleted.
   2. Dataset has been duplicated by another dataset.
   3. Dataset is a duplicate of another dataset, and is currently pending acceptance into the system.
   4. Dataset is a rejected duplicate of an another dataset.
   5. Dataset has been overwritten by another dataset (a dataset reaches this state once it's
      duplicate dataset has been accepted into the system).
  -->

    <va-alert v-if="alertConfig.alertType === 'IS_DUPLICATE'" color="warning">
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
            router.push(
              `/datasets/${props.dataset.id}/actionItems/${props.dataset.action_items[0].id}`,
            )
          "
        >
          Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
        </va-button>
      </div>
    </va-alert>

    <div v-if="alertConfig.alertType === 'DUPLICATES_INCOMING'">
      <va-alert
        v-for="(duplicateDataset, index) in datasetDuplicates(props.dataset) ||
        []"
        color="warning"
        :key="index"
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

          <!-- Allow users to see any active action items for this duplication -->
          <va-button
            v-if="duplicateDataset.action_items.length > 0"
            @click="
              router.push(
                `/datasets/${duplicateDataset.id}/actionItems/${duplicateDataset.action_items[0].id}`,
              )
            "
          >
            Accept/Reject duplicate <i-mdi-arrow-right-bold-box-outline />
          </va-button>
        </div>
      </va-alert>
    </div>

    <va-alert
      v-if="alertConfig.alertType === 'REJECTED_DUPLICATE'"
      color="danger"
    >
      This dataset is a rejected duplicate of
      <a
        :href="`/datasets/${props.dataset.duplicated_from?.original_dataset_id}`"
      >
        #{{ props.dataset.duplicated_from?.original_dataset_id }}
      </a>
    </va-alert>

    <!-- The current dataset has been overwritten by another dataset -->
    <va-alert v-if="alertConfig.alertType === 'OVERWRITTEN'" color="warning">
      This dataset has been overwritten by duplicate
      <a :href="`/datasets/${overwrittenBy(props.dataset).id}`">
        #{{ overwrittenBy(props.dataset).id }}
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

const overwrittenBy = (dataset) => {
  // When a dataset overwrites another, it's `is_duplicate` is changed from `true` to `false`
  (dataset.duplicated_by || []).find((d) => !d.is_duplicate);
};

const datasetDuplicates = (dataset) =>
  (dataset.duplicated_by || [])
    .map((duplicationRecord) => duplicationRecord.duplicate_dataset)
    // sort duplicates by version - most recent version first
    .sort((duplicate1, duplicate2) =>
      duplicate2.version - duplicate1.version,
    );

const alertConfig = computed(() => {
  const dataset = props.dataset;

  if (Object.values(dataset).length === 0) {
    return {};
  }

  // let duplicatedFromId = dataset.duplicated_from?.original_dataset_id;
  // let duplicates = (dataset.duplicated_by || [])
  //   .map((duplicationRecord) => duplicationRecord.duplicate_dataset)
  //   // sort duplicates by version - most recent version first
  //   .sort((duplicate1, duplicate2) =>
  //     dayjs(duplicate2.version).diff(dayjs(duplicate1.version)),
  //   );
  //
  // let title = "";
  // let alertColor = "";
  // let text = "";
  let alertType = "";

  console.log("determining alertConfig");
  console.dir(dataset, { depth: null });

  if (dataset.is_duplicate) {
    // if dataset is a duplicate of another,
    alertType = "IS_DUPLICATE";
  } else {
    if (!dataset.is_deleted) {
      // if dataset is active in the system,
      if (dataset.duplicated_by?.length > 0) {
        // and it has been duplicated by other datasets.
        alertType = "DUPLICATES_INCOMING";
      }
    } else {
      // dataset has reached one of 3 potential deleted states:
      const datasetState = currentState(dataset);
      if (datasetState === "DELETED") {
        // either dataset has been soft-deleted,
        alertType = "INACTIVE_DATASET";
      } else if (datasetState === "REJECTED_DUPLICATE") {
        // or, dataset is a duplicate which has been rejected from being ingested into the system
        alertType = "REJECTED_DUPLICATE";
      } else if (datasetState === "OVERWRITTEN") {
        // or, dataset has been overwritten by another dataset.
        alertType = "OVERWRITTEN";
      }
    }
  }

  return {
    alertType,
  };
});

const currentState = (dataset) => {
  const latestState = dataset.states[dataset.states.length - 1];
  return latestState.state;
};
</script>
