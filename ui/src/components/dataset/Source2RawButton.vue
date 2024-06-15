<template>
  <VaPopover :disabled="!disabled" :message="reason" v-if="isSourceDataset">
    <va-button
      :disabled="disabled"
      class="flex-initial"
      color="primary"
      border-color="primary"
      preset="secondary"
      @click="visible = !visible"
    >
      <i-mdi-dots-circle class="pr-2 text-2xl" /> Source2Raw
    </va-button>
  </VaPopover>

  <va-modal
    :model-value="visible"
    title="Source2Raw Conversion"
    @ok="convert_dataset"
    @cancel="visible = !visible"
  >
    <div>
      <p>This action will run a workflow that performs these tasks:</p>
      <ul class="pl-3 list-disc">
        <li>Stage this dataset.</li>
        <li>
          Convert the source dataset to a raw dataset using
          <i>dicom2bids</i>.
        </li>
        <li>
          Archive the raw dataset to the archive storage and copy the directory
          to its project path.
        </li>
      </ul>
    </div>
  </va-modal>
</template>

<script setup>
import DatasetService from "@/services/dataset";
import workflowService from "@/services/workflow";

// Show button if the dataset is a source dataset
// Enable button if it does not have derived datasets or there are no pending conversions
// Show reason for disabling the button
// When clicked, open a modal to ask confirmation with additional information

const props = defineProps({
  dataset: Object,
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);

const isSourceDataset = computed(() => props.dataset.type === "SOURCE");

const hasDerivedDataset = computed(() => {
  return props.dataset.derived_datasets.filter((d) => !d.is_deleted).length > 0;
});

const isConversionPending = computed(() => {
  return workflowService.is_step_pending(
    "source2raw",
    props.dataset?.workflows,
  );
});

const disabled = computed(() => {
  return hasDerivedDataset.value || isConversionPending.value;
});

const reason = computed(() => {
  if (hasDerivedDataset.value) {
    return "This dataset has derived datasets";
  }

  if (isConversionPending.value) {
    return "There are pending conversions";
  }

  return "";
});

function convert_dataset() {
  loading.value = true;
  DatasetService.convert_dataset(props.dataset.id)
    .then(() => {
      visible.value = false;
      emit("update");
    })
    .finally(() => {
      loading.value = false;
    });
}
</script>
