<template>
  <va-modal
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    title="Tracks Search"
  >
    <div class="w-full">
      <va-form class="flex flex-col gap-3 md:gap-5">
        <!-- name filter -->
        <va-input
          label="Name"
          v-model="form.name"
          placeholder="Search by BAM file or Data Product"
        />

        <va-select
          v-model="form.genomeType"
          :options="genomeTypes"
          text-by="label"
          value-by="key"
          label="Genome Type"
          placeholder="Choose a Genome Type"
        >
        </va-select>

        <va-select
          v-model="form.genomeValue"
          :options="genomeValues"
          :disabled="!form.genomeType"
          label="Genome Value"
          placeholder="Choose a Genome Assembly"
        >
        </va-select>

        <!-- created_at date range filter -->
        <VaDateInput
          v-model="form.created_at"
          mode="range"
          placeholder="filter by created date range"
          label="Created At"
        />

        <!-- updated_at range filter -->
        <VaDateInput
          v-model="form.updated_at"
          mode="range"
          placeholder="filter by updated date range"
          label="Updated At"
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
        <va-button class="flex-none" @click="handleSearch">Search</va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import constants from "@/constants"; // const emit = defineEmits(["update"]);
import { useTracksStore } from "@/stores/tracks";
import { storeToRefs } from "pinia";
// const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const emit = defineEmits(["search"]);

const store = useTracksStore();
const { filters } = storeToRefs(store);

const visible = ref(false);
const form = ref({});

const genomeTypes = Object.keys(constants.GENOME_TYPES).map(type => {
  // capitalize first letter
  return {
    label: type.charAt(0).toUpperCase() + type.slice(1),
    key: type,
    // ...type
  }
});

const genomeValues = computed(() => {
  return constants.GENOME_TYPES[form.value.genomeType];
})

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
