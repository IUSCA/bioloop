<template>
  <div class="flex flex-col gap-4">
    <div class="flex gap-4">
      <va-date-input
        v-model="start_date"
        label="Start Date"
        :rules="[(v) => !!v || 'Start Date is required', validateStartDateTime]"
        class="flex-1"
      />
      <va-time-input
        v-model="start_time"
        label="Start Time"
        class="flex-1"
        :rules="[validateStartDateTime]"
      />
    </div>

    <div class="flex gap-4">
      <va-date-input
        v-model="end_date"
        label="End Date"
        class="flex-1"
        :rules="[validateEndDateTime]"
      />
      <va-time-input
        v-model="end_time"
        label="End Time"
        class="flex-1"
        :rules="[validateEndDateTime]"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  isNewAlert: {
    type: Boolean,
    default: false,
  },
  startTime: {
    type: Date,
    default: undefined,
  },
  endTime: {
    type: Date,
    default: undefined,
  },
});

const emit = defineEmits([
  "update:startTime",
  "update:endTime",
  // "validateForm",
]);

const now = new Date();

function getDefaultStartTime() {
  const time = new Date(now.getTime() + 10 * 60000); // 10 minutes from now
  time.setSeconds(0, 0);
  return time;
}

function getDefaultEndTime() {
  const time = new Date(now.getTime() + 70 * 60000); // 70 minutes from now
  time.setSeconds(0, 0);
  return time;
}

const updateDateTime = (currentValue, newDate, newTime) => {
  const updatedDateTime = new Date(newDate);
  updatedDateTime.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
  console.log("Updated DateTime:", updatedDateTime);
  return updatedDateTime;
};

const updateTime = (currentValue, newTime) => {
  const updatedDateTime = new Date(currentValue);
  updatedDateTime.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
  console.log("Updated Time:", updatedDateTime);
  return updatedDateTime;
};

const internalStartTime = ref(props.startTime || getDefaultStartTime());
const internalEndTime = ref(props.endTime || getDefaultEndTime());

const start_date = computed({
  get: () => internalStartTime.value,
  set: (newValue) => {
    if (newValue && internalStartTime.value) {
      internalStartTime.value = updateDateTime(
        internalStartTime.value,
        newValue,
        internalStartTime.value,
      );
      emit("update:startTime", internalStartTime.value);
    }
  },
});

const start_time = computed({
  get: () => internalStartTime.value,
  set: (newValue) => {
    if (newValue && internalStartTime.value) {
      internalStartTime.value = updateTime(internalStartTime.value, newValue);
      emit("update:startTime", internalStartTime.value);
    }
  },
});

const end_date = computed({
  get: () => internalEndTime.value,
  set: (newValue) => {
    const newDateTime = updateDateTime(
      internalEndTime.value,
      newValue,
      internalEndTime.value,
    );
    if (!isNaN(newDateTime.getTime())) {
      internalEndTime.value = newDateTime;
      emit("update:endTime", internalEndTime.value);
    }
  },
});

const end_time = computed({
  get: () => internalEndTime.value,
  set: (newValue) => {
    internalEndTime.value = updateTime(internalEndTime.value, newValue);
    emit("update:endTime", internalEndTime.value);
  },
});

const validateEndDateTime = () => {
  if (!internalStartTime.value || !internalEndTime.value)
    return "Both Start and End times are required";
  return (
    internalEndTime.value > internalStartTime.value ||
    "End time must be after start time"
  );
};

const validateStartDateTime = () => {
  if (!internalStartTime.value) return true;
  const now = new Date();
  const selectedDateTime = new Date(internalStartTime.value);

  if (selectedDateTime.getTime() <= now.getTime()) {
    return "Start time must be in the future";
  }

  return true;
};

// const validateStartTime = (value) => {
//   if (!value) return true;
//   const now = new Date();
//   const selectedDateTime = new Date(internalStartTime.value);
//   return (
//     selectedDateTime.getTime() > now.getTime() ||
//     "Start time must be in the future"
//   );
// };
//
// const validateStartDate = (value) => {
//   if (!value) return true;
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   return (
//     new Date(value) >= today || "Start date must be today or in the future"
//   );
// };

// watch(internalStartTime, () => {
//   validateEndDateTime();
// });

// watch(start_date, () => {
//   validateStartTime(internalStartTime.value);
// });

watch(
  () => props.startTime,
  (newValue) => {
    internalStartTime.value = newValue
      ? new Date(newValue)
      : getDefaultStartTime();
  },
);

watch(
  () => props.endTime,
  (newValue) => {
    internalEndTime.value = newValue
      ? new Date(newValue)
      : props.isNewAlert
        ? getDefaultEndTime()
        : null;
  },
);

const emitDefaultValues = () => {
  console.log("Emitting default values");
  // console.log("Start Time:", start_time.value);
  // console.log("End Time:", end_time.value);
  console.log("internalStartTime:", internalStartTime.value);
  console.log("internalEndTime:", internalEndTime.value);

  emit("update:startTime", internalStartTime.value);

  emit("update:endTime", internalEndTime.value);
  // }
};

onMounted(() => {
  emitDefaultValues();
});

// watch([start_date, start_time, end_date, end_time], () => {
//   emit("validateForm");
// });
</script>
