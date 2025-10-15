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

// Define models
const startTime = defineModel("startTime");
const endTime = defineModel("endTime");

// Internal reactive state for separate date/time inputs
const internalStartDate = ref(null);
const internalStartTime = ref(null);
const internalEndDate = ref(null);
const internalEndTime = ref(null);

// Flags to prevent circular updates
const isUpdatingFromParent = ref(false);

// Helper function to combine date and time into a single datetime
const combineDateTime = (date, time) => {
  console.log("🔧 combineDateTime() called with date:", date, "time:", time);
  
  if (!date) {
    console.log("🔧 combineDateTime() returning null (no date)");
    return null;
  }
  
  const combined = new Date(date);
  console.log("🔧 combineDateTime() created base date:", combined);
  
  if (time) {
    const timeObj = new Date(time);
    console.log("🔧 combineDateTime() time object:", timeObj);
    console.log("🔧 combineDateTime() extracting hours:", timeObj.getHours(), "minutes:", timeObj.getMinutes(), "seconds:", timeObj.getSeconds());
    combined.setHours(timeObj.getHours(), timeObj.getMinutes(), timeObj.getSeconds());
    console.log("🔧 combineDateTime() after setting time:", combined);
  }
  
  console.log("🔧 combineDateTime() returning:", combined);
  return combined;
};

// Helper function to split datetime into separate date and time
const splitDateTime = (datetime) => {
  console.log("🔨 splitDateTime() called with:", datetime);
  
  if (!datetime) {
    console.log("🔨 splitDateTime() returning null values (no datetime)");
    return { date: null, time: null };
  }
  
  const dt = new Date(datetime);
  console.log("🔨 splitDateTime() parsed datetime:", dt);
  
  const date = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const time = new Date(1970, 0, 1, dt.getHours(), dt.getMinutes(), dt.getSeconds());
  
  console.log("🔨 splitDateTime() split into date:", date, "time:", time);
  return { date, time };
};

// Watch for changes from parent and update internal state
watch(() => startTime.value, (newValue) => {
  console.log("🔄 WATCHER: startTime.value changed to:", newValue);
  isUpdatingFromParent.value = true;
  const { date, time } = splitDateTime(newValue);
  console.log("🔄 WATCHER: Split into date:", date, "time:", time);
  internalStartDate.value = date;
  internalStartTime.value = time;
  console.log("🔄 WATCHER: Updated internal values, isUpdatingFromParent = true");
  nextTick(() => {
    isUpdatingFromParent.value = false;
    console.log("🔄 WATCHER: nextTick - isUpdatingFromParent = false");
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
  console.log("⚡ INTERNAL WATCHER: internalStartDate or internalStartTime changed");
  console.log("⚡ INTERNAL WATCHER: internalStartDate:", internalStartDate.value);
  console.log("⚡ INTERNAL WATCHER: internalStartTime:", internalStartTime.value);
  console.log("⚡ INTERNAL WATCHER: isUpdatingFromParent:", isUpdatingFromParent.value);
  
  if (!isUpdatingFromParent.value) {
    const combined = combineDateTime(internalStartDate.value, internalStartTime.value);
    console.log("⚡ INTERNAL WATCHER: Updating parent startTime to:", combined);
    startTime.value = combined;
  } else {
    console.log("⚡ INTERNAL WATCHER: Skipping parent update (isUpdatingFromParent = true)");
  }
});

watch([internalEndDate, internalEndTime], () => {
  if (!isUpdatingFromParent.value) {
    endTime.value = combineDateTime(internalEndDate.value, internalEndTime.value);
  }
});

// Validation functions
const validateStartDate = (date) => {
  console.log("========== validateStartDate() BEGIN ==========");
  console.log("Input date:", date);
  console.log("Date type:", typeof date);
  console.log("Date instanceof Date:", date instanceof Date);
  
  if (!date) {
    console.log("No date provided, returning true");
    console.log("========== validateStartDate() END ==========");
    return true;
  }
  
  console.log("internalStartTime.value:", internalStartTime.value);
  console.log("internalEndDate.value:", internalEndDate.value);
  console.log("internalEndTime.value:", internalEndTime.value);
  
  const startDateTime = combineDateTime(date, internalStartTime.value);
  const endDateTime = combineDateTime(internalEndDate.value, internalEndTime.value);
  
  console.log("Combined startDateTime:", startDateTime);
  console.log("Combined endDateTime:", endDateTime);
  
  // Check if start date is in the past
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);
  
  console.log("Current date/time (now):", now);
  console.log("Today (start of day):", today);
  console.log("Selected date (start of day):", selectedDate);
  console.log("Selected date < today?", selectedDate < today);
  console.log("Selected date.getTime():", selectedDate.getTime());
  console.log("Today.getTime():", today.getTime());
  
  if (selectedDate < today) {
    console.log("VALIDATION FAILED: Start date is in the past");
    console.log("========== validateStartDate() END ==========");
    return "Start date cannot be in the past";
  }
  
  if (startDateTime && endDateTime && startDateTime >= endDateTime) {
    console.log("VALIDATION FAILED: Start date/time >= end date/time");
    console.log("startDateTime.getTime():", startDateTime.getTime());
    console.log("endDateTime.getTime():", endDateTime.getTime());
    
    // Check if it's the same date but different times
    const startDateOnly = new Date(startDateTime);
    startDateOnly.setHours(0, 0, 0, 0);
    const endDateOnly = new Date(endDateTime);
    endDateOnly.setHours(0, 0, 0, 0);
    
    console.log("Start date only:", startDateOnly);
    console.log("End date only:", endDateOnly);
    console.log("Same date?", startDateOnly.getTime() === endDateOnly.getTime());
    
    if (startDateOnly.getTime() === endDateOnly.getTime()) {
      // Same date, so the issue is with time
      console.log("Same date detected, time validation should be handled by time fields");
      console.log("========== validateStartDate() END ==========");
      return true; // Let time validation handle this
    } else {
      // Different dates and start >= end
      console.log("========== validateStartDate() END ==========");
      return "Start date must be before end date";
    }
  }
  
  console.log("VALIDATION PASSED: All checks passed");
  console.log("========== validateStartDate() END ==========");
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
      // Same date, so the issue is with time - let time validation handle this
      return true;
    } else {
      // Different dates and start >= end
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