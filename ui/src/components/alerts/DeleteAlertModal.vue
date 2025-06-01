<template>
  <va-modal
    v-model="visible"
    title="Delete Alert"
    @ok="deleteAlert"
    @cancel="hideModal"
    :loading="loading"
  >
    <p>
      Are you sure you want to delete the alert "{{ alertToDelete?.label }}"?
    </p>
  </va-modal>
</template>

<script setup>
import alertService from "@/services/alert";
import toast from "@/services/toast";

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);

const alertToDelete = ref(null);

const showModal = (alert) => {
  visible.value = true;
  alertToDelete.value = alert;
};

const hideModal = () => {
  visible.value = false;
  alertToDelete.value = null;
};

const deleteAlert = async () => {
  if (!alertToDelete.value) return;

  loading.value = true;
  try {
    await alertService.delete(alertToDelete.value.id);
    toast.success("Alert deleted successfully");
    emit("update");
    hideModal();
  } catch (error) {
    toast.error("Failed to delete alert");
  } finally {
    loading.value = false;
  }
};

defineExpose({ showModal });
</script>
