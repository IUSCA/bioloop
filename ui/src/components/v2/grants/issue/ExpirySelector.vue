<template>
  <div>
    <!-- <p class="mb-2 text-sm font-medium uppercase tracking-wide">Expiry</p> -->

    <div class="flex flex-wrap items-center gap-2">
      <ModernButtonToggle
        v-model="isNever"
        :options="[
          { label: 'Never expires', value: true },
          { label: 'Set date', value: false },
        ]"
        text-by="label"
        value-by="value"
      />

      <div class="expiry-date-input w-44">
        <VaDateInput
          v-if="!isNever"
          v-model="dateValue"
          manual-input
          class="text-sm"
          aria-label="Expiry date"
          :allowedDays="fromTodayOnwards"
        />
      </div>
    </div>

    <p>
      <span class="text-xs va-text-secondary">
        <span v-if="isNever"
          >The grant will remain active until manually revoked</span
        >

        <span v-else>
          The grant will automatically expire at
          {{ datetime.displayDateTime(dateValue) }} ({{
            datetime.fromNow(dateValue, true)
          }}
          from now)
        </span>
      </span>
    </p>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

// ExpirySelector v-model contract:
// - never expires: { type: 'never', value: null }
// - date expires:  { type: 'date', value: Date }
//
// Two-way binding strategy:
// - UI reads from `model.value` through computed getters
// - UI writes to `model.value` through computed setters
// - no separate dual watch syncing is needed; model is single source of truth
const model = defineModel();

const DEFAULT_EXPIRY_DAYS = 30; // default to 30 days from now
const EXPIRY_HOUR = 23; // default expiry time to end of day at 11 PM

const withExpiryHour = (date) => {
  const d = new Date(date);
  d.setHours(EXPIRY_HOUR, 0, 0, 0);
  return d;
};

const defaultExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_EXPIRY_DAYS); // default to 30 days from now
  return withExpiryHour(date); // set default expiry time to end of day
};

const isNever = computed({
  get() {
    return !model.value || model.value.type !== "date";
  },
  set(value) {
    if (value) {
      model.value = { type: "never", value: null };
    } else {
      const date = defaultExpiryDate();
      model.value = { type: "date", value: date };
    }
  },
});

const dateValue = computed({
  get() {
    if (model.value && model.value.type === "date" && model.value.value) {
      return model.value.value;
    }
    return defaultExpiryDate();
  },
  set(date) {
    model.value = { type: "date", value: withExpiryHour(date) };
  },
});

function fromTodayOnwards(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

watchEffect(() => {
  if (!model.value) {
    model.value = { type: "never", value: null };
  }
});
</script>

<style scoped lang="scss">
:deep(.expiry-date-input) {
  .va-input-wrapper__field {
    --va-input-wrapper-min-height: 32px;
  }
}
</style>
