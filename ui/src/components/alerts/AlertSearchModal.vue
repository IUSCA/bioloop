<template>
  <va-modal
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    title="Alert Search"
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
        >
        </va-select>

        <!-- Start time filter -->
        <va-date-input
          v-model="form.date_range"
          mode="range"
          placeholder="Filter by Date range"
          label="Date Range"
        />

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
        <va-button class="flex-none" @click="handleSearch"> Search </va-button>
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

function hide() {
  visible.value = false;
}

function show() {
  const currentFilters = { ...filters.value };
  if (currentFilters.start_time && currentFilters.end_time) {
    currentFilters.date_range = {
      start: currentFilters.start_time,
      end: currentFilters.end_time,
    };
    delete currentFilters.start_time;
    delete currentFilters.end_time;
  }
  form.value = currentFilters;

  visible.value = true;
}

function handleSearch() {
  console.log("AlertSearchModal handleSearch called");
  console.log("form.value: ", form.value);
  const newFilters = { ...form.value };
  if (newFilters.date_range) {
    newFilters.start_time = newFilters.date_range.start;
    newFilters.end_time = newFilters.date_range.end;
    delete newFilters.date_range;
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
    date_range: null,
  };
}

defineExpose({
  show,
  hide,
});
</script>

<style scoped></style>
