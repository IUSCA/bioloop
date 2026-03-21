<template>
  <va-modal
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    title="Filter Alerts"
  >
    <div class="w-full">
      <va-form class="flex flex-col gap-3 md:gap-5">
        <!-- Status filter -->
        <va-select
          v-model="form.status"
          :options="alertStatuses"
          :text-by="(str) => str.toLowerCase()"
          label="Status"
          placeholder="Choose a status"
          clearable
        >
        </va-select>

        <!-- Type filter -->
        <va-select
          v-model="form.type"
          :options="alertTypes"
          :text-by="(str) => str.toLowerCase()"
          label="Type"
          placeholder="Choose a type"
          clearable
        >
        </va-select>

        <!-- Date/Time Range Filter -->
        <div class="flex flex-col gap-3">
          <StartEndDatetimeInputs
            v-model:startTime="form.start_time"
            v-model:endTime="form.end_time"
            :disabled="areDateFieldsDisabled"
            :validate-dates="false"
          />
        </div>

        <!-- Is Hidden filter -->
        <va-checkbox v-model="form.is_hidden" label="Is Hidden" />
      </va-form>
    </div>

    <!-- footer -->
    <template #footer>
      <div class="flex w-full gap-5">
        <!-- cancel button -->
        <va-button preset="secondary" class="flex-none" @click="hide">
          Cancel
        </va-button>

        <!-- reset button -->
        <va-button
          preset="secondary"
          class="flex-none ml-auto"
          @click="handleReset"
        >
          Reset
        </va-button>

        <!-- search button -->
        <va-button class="flex-none" @click="handleSearch"> Filter </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import alertService from "@/services/alert";
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";

const emit = defineEmits(["search"]);

const store = useAlertStore();
const { filters } = storeToRefs(store);

const visible = ref(false);
const alertTypes = ref([]);
const alertStatuses = ref([]);

const form = ref(store.defaultFilters());

// Date/Time fields are disabled when status is selected
const areDateFieldsDisabled = computed(() => !!form.value.status);

function hide() {
  visible.value = false;
}

function show() {
  const currentFilters = { ...filters.value };
  form.value = currentFilters;

  visible.value = true;
}

function handleSearch() {
  const newFilters = { ...form.value };
  filters.value = newFilters;

  hide();
  emit("search");
}

function handleReset() {
  form.value = {
    ...store.defaultFilters(),
  };
}

// Clear date fields when status is selected
watch(
  () => form.value.status,
  (newValue) => {
    if (newValue) {
      // Status selected - clear date fields
      form.value.start_time = null;
      form.value.end_time = null;
    }
  },
);

defineExpose({
  show,
  hide,
});

onMounted(async () => {
  Promise.all([alertService.getTypes(), alertService.getStatuses()]).then(
    ([res1, res2]) => {
      const types = res1.data;
      const statuses = res2.data;
      alertTypes.value = types;
      alertStatuses.value = statuses;
    },
  );
});
</script>
