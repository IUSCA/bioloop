<template>
  <va-modal
    v-model="visible"
    title="Share Dataset"
    okText="Share"
    size="small"
    @ok="handleOk"
    @close="hide"
    no-outside-dismiss
  >
    <va-inner-loading :loading="loading">
      <div>
        <span>
          Share {{ config.dataset.types[dataset.type]?.label }} /
          {{ dataset.name }} with other users or projects?
        </span>
        <va-input
          v-model="shareWith"
          label="Share with (email or project name)"
          class="mt-4"
        />
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import config from "@/config";
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
const shareWith = ref("");

function hide() {
  loading.value = false;
  visible.value = false;
  shareWith.value = "";
}

function show() {
  visible.value = true;
}

function handleOk() {
  loading.value = true;
  // DatasetService.shareDataset(props.dataset.id, shareWith.value)
  //   .then(() => {
  //     emit("update", props.dataset.id);
  //   })
  //   .catch((error) => {
  //     console.error("Error sharing dataset:", error);
  //     // Handle error (e.g., show an error message)
  //   })
  //   .finally(() => {
  //     hide();
  //   });
}
</script>
