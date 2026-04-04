<template>
  <VaModal
    v-model="visible"
    title="Archive Dataset"
    hide-default-actions
    @cancel="reset"
  >
    <VaInnerLoading :loading="loading">
      <div class="space-y-4">
        <VaAlert color="warning">
          <template #title>Archiving will freeze this dataset</template>
          <div class="text-sm">All changes will be blocked until archived.</div>
        </VaAlert>

        <div class="text-sm space-y-2">
          <div><strong>Dataset:</strong> {{ props.datasetName }}</div>
          <div><strong>Type:</strong> {{ props.datasetType }}</div>
        </div>

        <div>
          <p class="text-sm mb-2">To confirm, type the dataset name:</p>
          <VaInput
            v-model="confirmInput"
            placeholder="Type dataset name to confirm"
            name="confirm"
          />
        </div>
      </div>
    </VaInnerLoading>

    <template #footer>
      <div class="flex items-center justify-end gap-5">
        <VaButton preset="secondary" @click="reset">Cancel</VaButton>
        <VaButton
          color="danger"
          :disabled="confirmInput !== props.datasetName || loading"
          :loading="loading"
          @click="onConfirm"
        >
          Archive Dataset
        </VaButton>
      </div>
    </template>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import DatasetService from "@/services/v2/datasets";

const props = defineProps({
  datasetId: { type: String, required: true },
  datasetName: { type: String, required: true },
  datasetType: { type: String, required: true },
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);
const confirmInput = ref("");

async function onConfirm() {
  loading.value = true;
  try {
    await DatasetService.archive(props.datasetId);
    toast.success("Dataset archived successfully.");
    reset();
    visible.value = false;
    emit("update");
  } catch (err) {
    toast.error("Failed to archive dataset.");
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function reset() {
  confirmInput.value = "";
}

function show() {
  visible.value = true;
}

defineExpose({ show });
</script>
