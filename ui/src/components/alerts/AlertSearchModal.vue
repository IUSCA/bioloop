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
          v-model="form.start_time"
          placeholder="Filter by start time"
          label="Start Time"
        />

        <!-- End time filter -->
        <va-date-input
          v-model="form.end_time"
          placeholder="Filter by end time"
          label="End Time"
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
  form.value = { ...filters.value };
  visible.value = true;
}

function handleSearch() {
  filters.value = { ...form.value };
  hide();
  console.log("AlertSearchModal handleSearch called");
  emit("search");
}

function handleReset() {
  form.value = store.defaultFilters();
}

defineExpose({
  show,
  hide,
});
</script>

<style scoped></style>
