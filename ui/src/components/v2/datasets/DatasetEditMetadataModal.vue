<template>
  <VaModal
    v-model="visible"
    title="Edit Dataset Details"
    size="medium"
    @ok="onConfirm"
  >
    <VaForm ref="formRef">
      <div class="space-y-4">
        <VaInput
          v-model="formData.name"
          label="Name"
          required
          name="name"
          rules="required"
        />

        <VaTextarea
          v-model="formData.description"
          label="Description"
          name="description"
        />
      </div>
    </VaForm>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import DatasetService from "@/services/v2/datasets";

const props = defineProps({
  datasetId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);
const formRef = ref(null);
const formData = ref({
  name: props.name,
  description: props.description,
});

watch(
  () => props.name,
  (newVal) => {
    formData.value.name = newVal;
  },
);

watch(
  () => props.description,
  (newVal) => {
    formData.value.description = newVal;
  },
);

async function onConfirm() {
  if (!formRef.value.validate()) return;

  loading.value = true;
  try {
    await DatasetService.update(props.datasetId, {
      name: formData.value.name,
      description: formData.value.description,
    });
    toast.success("Dataset updated successfully.");
    visible.value = false;
    emit("update");
  } catch (err) {
    toast.error("Failed to update dataset.");
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function show() {
  visible.value = true;
}

defineExpose({ show });
</script>
