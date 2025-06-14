<template>
  <va-modal
    v-model="visible"
    :title="alertData.id ? 'Edit Alert' : 'New Alert'"
    @ok="saveAlert"
    @cancel="hideModal"
    :loading="loading"
  >
    <va-form @submit.prevent="saveAlert" class="flex flex-col gap-6">
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

      <div class="flex flex-row gap-4">
        <div class="flex flex-col gap-4 flex-grow">
          <va-date-input v-model="alertData.start_date" label="Start Date" />
          <va-date-input
            v-model="alertData.end_date"
            label="End Date"
            clearable
          />
        </div>
        <div class="flex flex-col gap-4 flex-grow">
          <va-time-input v-model="alertData.start_time" label="Start Time" />
          <va-time-input
            v-model="alertData.end_time"
            label="End Time"
            clearable
          />
        </div>
      </div>

      <va-textarea
        v-model="alertData.message"
        label="Message"
        class="w-full"
        rows="4"
      />
    </va-form>
  </va-modal>
</template>

<script setup>
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
  type: "INFO",
  start_date: null,
  start_time: null,
  end_date: null,
  end_time: null,
});

const showModal = (alert = null) => {
  console.log("showModal() called");

  visible.value = true;

  console.log("alert.start_time", alert?.start_time);
  console.log("alert.end_time", alert?.end_time);

  // derive Date fields `start_date` and `end_date` from persisted
  // DateTime objects `start_time` and `end_time`
  if (alert) {
    const startDate = alert.start_time ? new Date(alert.start_time) : null;
    console.log("startDate", startDate);
    console.log("typeof startDate", typeof startDate);
    const endDate = alert.end_time ? new Date(alert.end_time) : null;
    console.log("endDate", endDate);

    alertData.value = {
      ...alert,
      start_date: startDate,
      start_time: startDate,
      end_date: endDate,
      end_time: endDate,
    };
  } else {
    alertData.value = {
      label: "",
      message: "",
      type: "INFO",
      start_date: null,
      start_time: null,
      end_date: null,
      end_time: null,
    };
  }
};

const hideModal = () => {
  visible.value = false;
};

const combineDateTime = (date, time) => {
  if (!date || !time) return null;
  const combined = new Date(date);

  console.log("typeof time", typeof time);
  if (time instanceof Date) {
    console.log("Time is already a Date object");
    combined.setHours(time.getHours(), time.getMinutes());
  } else {
    console.error("Invalid time format:", time);
    return null;
  }

  console.log("Combined date and time:", combined);

  return combined;
};

const saveAlert = async () => {
  loading.value = true;

  console.log("Saving alert:", alertData.value);

  const dataToSave = {
    ...alertData.value,
    start_time: combineDateTime(
      alertData.value.start_date,
      alertData.value.start_time,
    ),
    end_time: combineDateTime(
      alertData.value.end_date,
      alertData.value.end_time,
    ),
  };
  delete dataToSave.start_date;
  delete dataToSave.end_date;

  try {
    if (dataToSave.id) {
      await alertService.update(dataToSave.id, dataToSave);
      toast.success("Alert updated successfully");
    } else {
      await alertService.create(dataToSave);
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
