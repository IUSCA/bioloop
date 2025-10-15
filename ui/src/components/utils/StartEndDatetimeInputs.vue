<template>
  <div class="flex flex-col gap-4">
    <div class="flex gap-4">
      <va-date-input
        v-model="internalStartDate"
        label="Start Date"
        :rules="props.validateDates ? [validateStartDate] : []"
        class="flex-1"
        :disabled="props.disabled"
      />
      <va-time-input
        v-model="internalStartTime"
        label="Start Time"
        class="flex-1"
        :rules="props.validateDates ? [validateStartTime] : []"
        :disabled="props.disabled"
      />
    </div>

    <div class="flex gap-4">
      <va-date-input
        v-model="internalEndDate"
        label="End Date"
        class="flex-1"
        :rules="props.validateDates ? [validateEndDate] : []"
        :disabled="props.disabled"
      />
      <va-time-input
        v-model="internalEndTime"
        label="End Time"
        class="flex-1"
        :rules="props.validateDates ? [validateEndTime] : []"
        :disabled="props.disabled"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  validateDates: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  }
})

// define models
const startTime = defineModel("startTime");
const endTime = defineModel("endTime");

// internal reactive state for separate date/time inputs
const internalStartDate = ref(null);
const internalStartTime = ref(null);
const internalEndDate = ref(null);
const internalEndTime = ref(null);

// flags to prevent circular updates
const isUpdatingFromParent = ref(false);

// Helper function to combine date and time into a single datetime
const combineDateTime = (date, time) => {
  if (!date) {
    return null;
  }
  
  const combined = new Date(date);
  
  if (time) {
    const timeObj = new Date(time);
    combined.setHours(timeObj.getHours(), timeObj.getMinutes(), timeObj.getSeconds());
  }
  
  return combined;
};

// Helper function to split datetime into separate date and time
const splitDateTime = (datetime) => {
  if (!datetime) {
    return { date: null, time: null };
  }
  
  const dt = new Date(datetime);
  
  const date = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const time = new Date(1970, 0, 1, dt.getHours(), dt.getMinutes(), dt.getSeconds());
  
  return { date, time };
};

// Watch for changes from parent and update internal state
watch(() => startTime.value, (newValue) => {
  isUpdatingFromParent.value = true;
  const { date, time } = splitDateTime(newValue);
  internalStartDate.value = date;
  internalStartTime.value = time;
  nextTick(() => {
    isUpdatingFromParent.value = false;
  });
}, { immediate: true });

watch(() => endTime.value, (newValue) => {
  isUpdatingFromParent.value = true;
  const { date, time } = splitDateTime(newValue);
  internalEndDate.value = date;
  internalEndTime.value = time;
  nextTick(() => {
    isUpdatingFromParent.value = false;
  });
}, { immediate: true });

// Watch internal changes and update parent
watch([internalStartDate, internalStartTime], () => {
  if (!isUpdatingFromParent.value) {
    const combined = combineDateTime(internalStartDate.value, internalStartTime.value);
    startTime.value = combined;
  }
});

watch([internalEndDate, internalEndTime], () => {
  if (!isUpdatingFromParent.value) {
    endTime.value = combineDateTime(internalEndDate.value, internalEndTime.value);
  }
});

// Validation functions
const validateStartDate = (date) => {
  if (!date) {
    return true;
  }
  
  const startDateTime = combineDateTime(date, internalStartTime.value);
  const endDateTime = combineDateTime(internalEndDate.value, internalEndTime.value);
  
  // Check if start date is in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);
  
  if (selectedDate < today) {
    return "Start date cannot be in the past";
  }
  
  if (startDateTime && endDateTime && startDateTime >= endDateTime) {
    // Check if it's the same date but different times
    const startDateOnly = new Date(startDateTime);
    startDateOnly.setHours(0, 0, 0, 0);
    const endDateOnly = new Date(endDateTime);
    endDateOnly.setHours(0, 0, 0, 0);
    
    if (startDateOnly.getTime() === endDateOnly.getTime()) {
      return true;
    } else {
      return "Start date must be before end date";
    }
  }
  
  return true;
};

const validateStartTime = (time) => {
  if (!time) return true;
  
  const startDateTime = combineDateTime(internalStartDate.value, time);
  const endDateTime = combineDateTime(internalEndDate.value, internalEndTime.value);
  
  if (startDateTime && endDateTime && startDateTime >= endDateTime) {
    return "Start time must be before end time";
  }
  
  return true;
};

const validateEndDate = (date) => {
  if (!date) return true;
  
  const startDateTime = combineDateTime(internalStartDate.value, internalStartTime.value);
  const endDateTime = combineDateTime(date, internalEndTime.value);
  
  if (startDateTime && endDateTime && startDateTime >= endDateTime) {
    // Check if it's the same date but different times
    const startDateOnly = new Date(startDateTime);
    startDateOnly.setHours(0, 0, 0, 0);
    const endDateOnly = new Date(endDateTime);
    endDateOnly.setHours(0, 0, 0, 0);
    
    if (startDateOnly.getTime() === endDateOnly.getTime()) {
      return true;
    } else {
      return "End date must be after start date";
    }
  }
  
  return true;
};

const validateEndTime = (time) => {
  if (!time) return true;
  
  const startDateTime = combineDateTime(internalStartDate.value, internalStartTime.value);
  const endDateTime = combineDateTime(internalEndDate.value, time);
  
  if (startDateTime && endDateTime && startDateTime >= endDateTime) {
    return "End time must be after start time";
  }
  
  return true;
};
</script>