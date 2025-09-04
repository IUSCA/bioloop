<template>
  <va-modal
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    title="Conversion Search"
  >
    <div class="w-full">
      <va-form class="flex flex-col gap-3 md:gap-5">
        <!-- definition name filter -->
        <va-input
          label="Definition Name"
          v-model="form.definition_name"
          placeholder="Enter a term that matches any part of the definition name"
        />

        <!-- program name filter -->
        <va-input
          label="Program Name"
          v-model="form.program_name"
          placeholder="Enter a term that matches any part of the program name"
        />



        <!-- initiator filter -->
        <va-input
          label="Initiator"
          v-model="form.initiator"
          placeholder="Enter the username of the conversion initiator"
        />

        <!-- initiated_at date range filter -->
        <VaDateInput
          v-model="form.initiated_at"
          mode="range"
          placeholder="filter by initiated date range"
          label="Initiated At"
        />


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
import { useConversionStore } from "@/stores/conversion";
import { storeToRefs } from "pinia";

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const emit = defineEmits(["search"]);

const store = useConversionStore();
const { filters } = storeToRefs(store);

const visible = ref(false);
const form = ref({});

function hide() {
  visible.value = false;
}

function show() {
  // update form with current filters
  form.value = { ...filters.value };
  visible.value = true;
}

function handleSearch() {
  // update store state
  filters.value = { ...form.value };
  hide();
  emit("search");
}

function handleReset() {
  form.value = store.defaultFilters();
}
</script>
