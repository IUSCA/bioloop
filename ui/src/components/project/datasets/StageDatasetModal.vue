<template>
  <va-modal
    v-model="visible"
    title="Stage Dataset"
    okText="Stage"
    @ok="initiateAndLogStageAttempt"
    @close="hide"
    no-outside-dismiss
  >
    <va-inner-loading :loading="loading">
      <div>
        <span>
          Stage all files in {{ config.dataset.types[dataset.type]?.label }} /
          {{ dataset.name }} from the archive?
        </span>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import DatasetService from "@/services/dataset";
import StatisticsService from "@/services/statistics";
import config from "@/config";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  dataset: {
    type: Object,
    default: () => ({}),
  },
});
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const auth = useAuthStore();

const loading = ref(false);
const visible = ref(false);

function hide() {
  loading.value = false;
  visible.value = false;
}

function show() {
  visible.value = true;
}

function initiateStageAttempt() {
  loading.value = true;
  return DatasetService.stage_dataset(props.dataset.id)
    .then(() => {
      emit("update", props.dataset.id);
    })
    .finally(() => {
      hide();
    });
}

function initiateAndLogStageAttempt() {
  initiateStageAttempt().then(() => {
    // log stage attempt
    StatisticsService.log_stage_request({
      dataset_id: props.dataset.id,
      user_id: auth.user.id,
    });
  });
}
</script>
