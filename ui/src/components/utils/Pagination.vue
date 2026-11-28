<template>
  <div
    class="flex flex-wrap justify-center xl:justify-between items-center gap-3 xl:gap-5"
    v-if="props.curr_items > 0"
    data-testid="pagination-container"
  >
    <div
      class="flex-1 order-2 xl:flex-none xl:order-1"
      data-testid="pagination-summary"
    >
      <span>
        Showing {{ skip + 1 }}-{{ skip + props.curr_items }} of
        {{ props.total_results }}
      </span>
    </div>

    <!-- on smaller screen occupy 100% of the width and force other two elements to the row below -->
    <div
      class="flex-[1_1_100%] order-1 xl:flex-none xl:order-2 flex justify-center"
      data-testid="pagination-control"
    >
      <va-pagination
        class="flex-none"
        v-if="total_page_count > 1"
        v-model="page"
        :pages="total_page_count"
        :visible-pages="visiblePages"
        data-testid="pagination-component"
      />
    </div>

    <!-- fixed width on all screens -->
    <div class="w-36 order-3 flex-none" data-testid="results-per-page">
      <VaSelect
        label="Results per page"
        v-model="page_size"
        :options="props.page_size_options"
        placeholder="Select an option"
        :inner-label="true"
        data-testid="results-per-page-dropdown"
      />
    </div>
  </div>
</template>

<script setup>
import { useBreakpoint } from "vuestic-ui";
const breakpoint = useBreakpoint();

const props = defineProps({
  curr_items: {
    type: Number,
    required: true,
  },
  total_results: {
    type: Number,
    required: true,
  },
  page: {
    type: Number,
    required: true,
  },
  page_size: {
    type: Number,
    required: true,
  },
  page_size_options: {
    type: Array,
    required: true,
  },
});

const emit = defineEmits(["update:page", "update:page_size"]);

// page_size - internal state - v-model
// page - internal state - v-model
// total_count - props
// page_size_options - props
// visible-pages - props
// total_page_count - computed
// skip - computed

const page = computed({
  get() {
    return props.page;
  },
  set(value) {
    emit("update:page", value);
  },
});

const page_size = computed({
  get() {
    return props.page_size;
  },
  set(value) {
    emit("update:page_size", value);
  },
});

const total_page_count = computed(() => {
  return Math.ceil(props.total_results / page_size.value);
});

const skip = computed(() => {
  return page_size.value * (page.value - 1);
});

// on small devices show only 3 pages
// on large device show 5 pages
const visiblePages = computed(() => {
  return breakpoint.mdUp ? 5 : 3;
});
</script>
