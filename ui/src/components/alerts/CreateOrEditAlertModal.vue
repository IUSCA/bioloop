<template>
  <va-modal
    v-model="visible"
    :title="alertData.id ? 'Edit Alert' : 'New Alert'"
    @ok="saveAlert"
    @cancel="hideModal"
    :loading="loading"
  >
    <va-form @submit.prevent="saveAlert">
      <va-input
        v-model="alertData.label"
        label="Label"
        class="mb-4"
        :rules="[(v) => !!v || 'Label is required']"
      />
      <va-textarea
        v-model="alertData.message"
        label="Message"
        class="mb-4"
        :rules="[(v) => !!v || 'Message is required']"
      />
      <va-select
        v-model="alertData.type"
        label="Type"
        class="mb-4"
        :options="['INFO', 'WARNING', 'ERROR']"
      />
      <va-checkbox v-model="alertData.global" label="Global" class="mb-4" />
    </va-form>
  </va-modal>
</template>

<script setup>
import { ref } from "vue";
import alertService from "@/services/alert";
import toast from "@/services/toast";

const props = defineProps({
  alert: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);

const alertData = ref({
  label: "",
  message: "",
  global: false,
  type: "INFO",
});

const showModal = (alert = null) => {
  visible.value = true;
  if (alert) {
    alertData.value = { ...alert };
  } else {
    alertData.value = {
      label: "",
      message: "",
      global: false,
      type: "INFO",
    };
  }
};

const hideModal = () => {
  visible.value = false;
};

const saveAlert = async () => {
  loading.value = true;
  try {
    if (alertData.value.id) {
      await alertService.update(alertData.value.id, alertData.value);
      toast.success("Alert updated successfully");
    } else {
      await alertService.create(alertData.value);
      toast.success("Alert created successfully");
    }
    emit("update");
    hideModal();
  } catch (error) {
    toast.error("Failed to save alert");
  } finally {
    loading.value = false;
  }
};

defineExpose({ showModal });
</script>
