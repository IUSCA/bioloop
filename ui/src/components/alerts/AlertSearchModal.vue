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
        <!-- active filter -->
        <va-select
          v-model="form.active"
          :options="[
            { name: 'All', id: null },
            { name: 'Active', id: true },
            { name: 'Inactive', id: false },
          ]"
          text-by="name"
          value-by="id"
          label="Status"
          placeholder="Choose a status"
          :messages="
            form.active !== null && [
              'Start/End Date will be ignored when searching by active status',
            ]
          "
        >
        </va-select>

        <div class="flex gap-3 md:gap-5">
          <!-- Start time filter -->
          <va-date-input
            v-model="form.start_time"
            placeholder="Start Date after"
            label="Start Date"
            :disabled="areDateFieldsDisabled"
          />

          <!-- End time filter -->
          <va-date-input
            v-model="form.end_time"
            placeholder="End Date before"
            label="End Date"
            :disabled="areDateFieldsDisabled"
          />
        </div>

        <!-- type filter -->
        <va-select
          v-model="form.type"
          :options="[
            { name: 'All', id: null },
            { name: 'Info', id: 'INFO' },
            { name: 'Warning', id: 'WARNING' },
            { name: 'Error', id: 'ERROR' },
          ]"
          text-by="name"
          value-by="id"
          label="Type"
          placeholder="Choose a type"
        >
        </va-select>
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
import { useAlertStore } from "@/stores/alert";
import { storeToRefs } from "pinia";

const emit = defineEmits(["search"]);

const store = useAlertStore();
const { filters } = storeToRefs(store);

const visible = ref(false);

const form = ref(store.defaultFilters());

const areDateFieldsDisabled = computed(() => form.value.active !== null);

function hide() {
  visible.value = false;
}

function show() {
  const currentFilters = { ...filters.value };
  form.value = currentFilters;

  visible.value = true;
}

function handleSearch() {
  console.log("AlertSearchModal handleSearch called");
  console.log("form.value: ", form.value);
  const newFilters = { ...form.value };

  if (newFilters.active !== null) {
    delete newFilters.start_time;
    delete newFilters.end_time;
  }

  filters.value = newFilters;
  console.log("filters.value after reset: ", filters.value);

  hide();
  // console.log("AlertSearchModal handleSearch called");
  emit("search");
}

function handleReset() {
  form.value = {
    ...store.defaultFilters(),
    // date_range: null,
  };
}

watch(
  () => form.value.active,
  (newValue) => {
    if (newValue !== null) {
      form.value.start_time = null;
      form.value.end_time = null;
    }
  },
);

onMounted(() => {
  console.log("AlertSearchModal mounted");
  console.log("filters.value: ", filters.value);
});

defineExpose({
  show,
  hide,
});
</script>

<style scoped></style>
