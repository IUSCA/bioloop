<template>
  <va-modal
    v-model="visible"
    :title="id ? 'Edit Alert' : 'New Alert'"
    hide-default-actions
    @ok="handleSubmit"
    @cancel="hideModal"
    :loading="loading"
  >
    <va-form
      @submit.prevent="saveAlert"
      ref="alertForm"
      class="flex flex-col gap-6"
    >
      <div class="flex flex-row gap-4">
        <va-input
          v-model="alertData.label"
          label="Label"
          class="flex-grow"
          :rules="[(v) => !!v || 'Label is required']"
        />
        <va-select
          v-model="alertData.type"
          label="Type"
          class="w-1/3"
          :options="['INFO', 'WARNING', 'ERROR']"
        />
      </div>

      <AlertDateTimeInputs
        v-model:startTime="alertData.start_time"
        v-model:endTime="alertData.end_time"
        :isNewAlert="!alertData.id"
      />

      <va-textarea
        v-model="alertData.message"
        label="Message"
        class="w-full"
        rows="4"
      />
    </va-form>

    <!-- Ok/Cancel buttons -->
    <template #footer>
      <div class="flex justify-end gap-4">
        <va-button @click="hideModal" text-color="secondary" preset="secondary">
          Cancel
        </va-button>
        <va-button @click="handleSubmit" :loading="loading">
          {{ id ? "Update" : "Create" }}
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import alertService from "@/services/alert";
import toast from "@/services/toast";
import { useForm } from "vuestic-ui";
import { cloneDeep } from "lodash";
import { useAlertStore } from "@/stores/alert";

const emit = defineEmits(["save"]);

const visible = ref(false);
const loading = ref(false);

const { validate } = useForm("alertForm");

const alertStore = useAlertStore();

const getDefaultAlert = () => ({
  id: null,
  label: "",
  message: null,
  type: "INFO",
  start_time: null,
  end_time: null,
});

const alertData = ref(getDefaultAlert());

const showModal = (alert = null) => {
  visible.value = true;
  if (alert) {
    alertData.value = {
      ...(alert.id && { id: alert.id }),
      label: alert.label,
      ...(alert.message && { message: alert.message }),
      type: alert.type,
      start_time: alert.start_time ? new Date(alert.start_time) : null,
      end_time: alert.end_time ? new Date(alert.end_time) : null,
    };
  } else {
    // console.log("else (new alert)");
    alertData.value = getDefaultAlert();
  }
};

defineExpose({ showModal });

const handleSubmit = async () => {
  console.log("handleSubmit() called");
  const isFormValid = await validate();
  console.log("isFormValid", isFormValid);
  if (isFormValid) {
    await saveAlert();
    // refresh store's alerts
    await alertStore.fetchAlerts();
  } else {
    // toast.error("Please fill in all required fields correctly");
  }
};

const hideModal = () => {
  visible.value = false;
};

const saveAlert = async () => {
  loading.value = true;

  console.log("Saving alert:", alertData.value);

  try {
    if (alertData.value.id) {
      await alertService.update(alertData.value.id, alertData.value);
      toast.success("Alert updated successfully");
    } else {
      await alertService.create(alertData.value);
      toast.success("Alert created successfully");
    }
    emit("save");
    hideModal();
  } catch (error) {
    toast.error("Failed to save alert");
  } finally {
    loading.value = false;
  }
};

// const validateForm = () => {
//   validate();
// };
</script>
