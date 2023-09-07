<template>
  <va-modal
    v-model="visible"
    title="Stage Dataset"
    okText="Stage"
    @ok="handleOk"
    @close="hide"
    no-outside-dismiss
  >
    <va-inner-loading :loading="loading">
      <div>
        <span>
          Stage all files in {{ config.dataset.types[dataset.type].label }} /
          {{ dataset.name }} from the archive?
        </span>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import DatasetService from "@/services/dataset";

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

const loading = ref(false);
const visible = ref(false);

function hide() {
  loading.value = false;
  visible.value = false;
}

function show() {
  visible.value = true;
}

function handleOk() {
  loading.value = true;
  DatasetService.stage_dataset(props.dataset.id)
    .then(() => {
      emit("update", props.dataset.id);
    })
    .finally(() => {
      hide();
    });
}
</script>
