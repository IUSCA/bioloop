<template>
  <va-modal
    v-model="visible"
    :title="alertData.id ? 'Edit Alert' : 'New Alert'"
    hide-default-actions
    @ok="handleSubmit"
    @cancel="hideModal"
    :loading="loading"
  >
    <!-- Create or Edit Alert Form -->
    <va-form
      @submit.prevent="saveAlert"
      ref="alertForm"
      class="flex flex-col gap-6"
    >
      <!-- Label -->
      <div class="flex flex-row gap-4">
        <va-input
          v-model="alertData.label"
          label="Label"
          class="w-full"
        />
      </div>

      <!-- Type -->
      <div>
        <va-select
          v-model="alertData.type"
          label="Type"
          :options="alertTypes"
          class="w-full"
          clearable
        />
      </div>

      <!-- Start Time and End Time -->
      <StartEndDatetimeInputs
        v-model:startTime="alertData.start_time"
        v-model:endTime="alertData.end_time"
      />

      <!-- Alert Message -->
      <va-textarea
        v-model="alertData.message"
        label="Message"
        class="w-full"
        rows="4"
      />

      <!-- Is Hidden? -->
      <va-switch
        v-model="alertData.is_hidden"
        label="Hidden"
      />
    </va-form>

    <!-- Ok/Cancel buttons -->
    <template #footer>
      <div class="flex justify-end gap-4">
        <va-button @click="hideModal" text-color="secondary" preset="secondary">
          Cancel
        </va-button>
        <va-button @click="handleSubmit" :loading="loading">
          {{ alertData.id ? "Update" : "Create" }}
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import constants from "@/constants";
import alertService from "@/services/alert";
import toast from "@/services/toast";
import { useAlertStore } from "@/stores/alert";
import { useForm } from "vuestic-ui";

const emit = defineEmits(["save"]);

const { validate } = useForm("alertForm");

const alertStore = useAlertStore();

const getDefaultAlert = () => ({
  id: null,
  label: "",
  message: null,
  type: constants.alerts.types.INFO,
  start_time: null,
  end_time: null,
  status: constants.alerts.statuses.SCHEDULED,
  is_hidden: false,
});

const alertData = ref(getDefaultAlert());

const visible = ref(false);
const loading = ref(false);
const alertTypes = ref([]);
const isNewAlert = ref(false);

const showModal = (alert = null) => {
  visible.value = true;
   
  if (alert) { // editing an alert
    alertData.value = {
      ...(alert.id && { id: alert.id }),
      label: alert.label,
      ...(alert.message && { message: alert.message }),
      type: alert.type,
      start_time: alert.start_time ? new Date(alert.start_time) : null,
      end_time: alert.end_time ? new Date(alert.end_time) : null,
      status: alert.status,
      is_hidden: alert.is_hidden,
    };
  } else { // creating a new alert
    alertData.value = getDefaultAlert();
    isNewAlert.value = true;
  }
};

defineExpose({ showModal });

const handleSubmit = async () => {
  const isFormValid = await validate();
  if (isFormValid) {
    await saveAlert();
    await alertStore.fetchAlerts();
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
    emit("save");
    hideModal();
  } catch (error) {
    toast.error("Failed to save alert");
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  Promise.all([
    alertService.getTypes(),
  ]).then(([res1]) => {
    const types = res1.data;
    alertTypes.value = types;
  });
});
</script>
