<template>
  <va-button-group>
    <va-button
      v-if="enableJumpToRangeExtremes"
      preset="secondary"
      icon="keyboard_double_arrow_left"
      @click="jumpToStartDateExtreme(props.startDateMin)"
      :disabled="isAtStartDateExtreme"
    ></va-button>
    <va-button
      icon="keyboard_arrow_left"
      preset="secondary"
      @click="changeDateRange(false, props.shiftBy)"
      :disabled="isAtStartDateExtreme"
    ></va-button>
    &nbsp;&nbsp;
    <va-date-input
      class="w-32"
      v-model="start_date"
      label="From"
      :format="(date) => format(date, 'P')"
      icon=""
      :is-open="false"
      :is-content-hoverable="false"
      :highlight-today="false"
      :read-only="true"
    ></va-date-input>
    &nbsp;&nbsp;
    <va-date-input
      v-model="end_date"
      class="w-32"
      label="To"
      :format="(date) => format(date, 'P')"
      icon=""
      :is-open="false"
      :is-content-hoverable="false"
      :highlight-today="false"
      :read-only="true"
    ></va-date-input>
    &nbsp;&nbsp;
    <va-button
      icon="keyboard_arrow_right"
      preset="secondary"
      @click="changeDateRange(true, props.shiftBy)"
      :disabled="isAtEndDateExtreme"
    ></va-button>
    <va-button
      v-if="enableJumpToRangeExtremes"
      preset="secondary"
      icon="keyboard_double_arrow_right"
      @click="jumpToEndDateExtreme(props.endDateMax)"
      :disabled="isAtEndDateExtreme"
    ></va-button>
  </va-button-group>
</template>

<script setup>
import { addMonths, format, subMonths } from "date-fns";

const emit = defineEmits(["dateRangeChanged"]);

const props = defineProps({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  startDateMin: { type: Date },
  endDateMax: { type: Date },
  shiftBy: {
    // Number of months by which to shift the date range forward or backward
    type: Number,
    default: () => 1,
  },
  enableJumpToRangeExtremes: { type: Boolean, default: () => false },
});

const start_date = ref(props.startDate);
const end_date = ref(props.endDate);

const isAtStartDateExtreme = ref(
  start_date.value.getTime() === props.startDateMin.getTime(),
);
const isAtEndDateExtreme = ref(
  end_date.value.getTime() === props.endDateMax.getTime(),
);

watch([start_date, end_date], () => {
  isAtStartDateExtreme.value =
    start_date.value.getTime() === props.startDateMin.getTime();
  isAtEndDateExtreme.value =
    end_date.value.getTime() === props.endDateMax.getTime();
});

const changeDateRange = (forward, shiftBy) => {
  end_date.value = forward
    ? !isAtEndDateExtreme.value && addMonths(end_date.value, shiftBy)
    : subMonths(end_date.value, shiftBy);

  start_date.value = forward
    ? addMonths(start_date.value, shiftBy)
    : !isAtStartDateExtreme.value && subMonths(start_date.value, shiftBy);
};

const jumpToStartDateExtreme = (newDate) => {
  start_date.value = newDate;
  end_date.value = addMonths(start_date.value, 3);
};

const jumpToEndDateExtreme = (newDate) => {
  end_date.value = newDate;
  start_date.value = subMonths(end_date.value, 3);
};

watch([start_date, end_date], () => {
  emit("dateRangeChanged", {
    startDate: start_date.value,
    endDate: end_date.value,
  });
});
</script>
