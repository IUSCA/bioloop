<!-- Adapted from and improved upon https://stevencotterill.com/articles/how-to-build-an-autocomplete-field-with-vue-3 -->
<template>
  <div class="relative" :data-testid="`${props.dataTestId}--container`">
    <OnClickOutside @trigger="closeResults">
      <va-form>
        <va-input
          :data-testid="props.dataTestId || 'autocomplete'"
          outline
          clearable
          @clear="emit('clear')"
          type="text"
          :placeholder="props.placeholder"
          v-model="text"
          class="w-full autocomplete-input"
          @click="openResults"
          :disabled="props.disabled"
          :label="props.label"
        >
          <template #prependInner><slot name="prependInner"></slot></template>
          <template #appendInner><slot name="appendInner"></slot></template>
        </va-input>
      </va-form>

      <ul
        v-if="props.loading"
        class="absolute w-full bg-white dark:bg-gray-900 border border-solid border-slate-200 dark:border-slate-800 shadow-lg rounded rounded-t-none p-2 z-10 max-h-56 overflow-y-scroll overflow-x-hidden"
        :data-testid="`${props.dataTestId}--search-results-ul__loading`"
      >
        <li
          class="pb-2 text-sm border-solid border-b border-slate-200 dark:border-slate-800 text-right va-text-secondary"
          :data-testid="`${props.dataTestId}--search-results-li__loading`"
        >
          <div class="flex">
            <va-icon
              class="mx-auto"
              name="loop"
              spin="clockwise"
              color="primary"
            />
          </div>
        </li>
      </ul>

      <ul
        v-else-if="visible"
        class="absolute w-full bg-white dark:bg-gray-900 border border-solid border-slate-200 dark:border-slate-800 shadow-lg rounded rounded-t-none p-2 z-10 max-h-56 overflow-y-scroll overflow-x-hidden"
        :data-testid="`${props.dataTestId}--search-results-ul`"
      >
        <li
          class="pb-2 text-sm border-solid border-b border-slate-200 dark:border-slate-800 text-right va-text-secondary"
          v-if="search_results.length"
          :data-testid="`${props.dataTestId}--search-results-count-li`"
        >
          Showing {{ search_results.length }} of {{ data.length }} results
        </li>
        <li
          v-for="(item, idx) in search_results"
          :key="idx"
          :data-testid="`${props.dataTestId}--search-result-li-${idx}`"
        >
          <button
            class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded w-full text-left"
            @click="handleSelect(item)"
          >
            <slot name="filtered" :item="item">
              {{ item[props.displayBy] }}
            </slot>
          </button>
        </li>
        <li
          v-if="search_results.length == 0"
          class="py-2 px-3"
          :data-testid="`${props.dataTestId}--no-search-results-li`"
        >
          <span
            class="flex gap-2 items-center justify-center va-text-secondary"
          >
            <i-mdi:magnify-remove-outline class="flex-none text-xl" />
            <span class="flex-none">None matched</span>
          </span>
        </li>
      </ul>
    </OnClickOutside>
  </div>
</template>

<script setup>
import { OnClickOutside } from "@vueuse/components";

const props = defineProps({
  searchText: {
    type: String,
    default: "",
  },
  label: {
    type: String,
    default: "",
  },
  placeholder: {
    type: String,
    default: "Type here",
  },
  data: {
    type: Array,
    default: () => [],
  },
  filterBy: {
    type: String,
    default: "value",
  },
  filterFn: {
    type: Function,
    default: null,
  },
  displayBy: {
    type: String,
    default: "name",
  },
  async: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  error: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  dataTestId: {
    type: String,
  },
});

const emit = defineEmits([
  "select",
  "clear",
  "update:searchText",
  "open",
  "close",
]);

const text = computed({
  get: () => props.searchText,
  set: (value) => {
    emit("update:searchText", value);
  },
});

const visible = ref(false);

// when clicked outside, hide the results ul
// when clicked on input show the results ul
// when clicked on a search result, clear text and hide the results ul

const search_results = computed(() => {
  if (text.value === "" || props.async) return props.data;

  const filterFn =
    props.filterFn instanceof Function
      ? props.filterFn(text.value)
      : (item) =>
          (item[props.filterBy] || "")
            .toLowerCase()
            .includes(text.value.toLowerCase());

  return (props.data || []).filter(filterFn);
});

function closeResults() {
  visible.value = false;
  emit("close");
}

function openResults() {
  visible.value = true;
  emit("open");
}

function handleSelect(item) {
  text.value = "";
  closeResults();
  emit("select", item);
}
</script>

<style lang="scss">
.autocomplete-input {
  /* Clear icon is too big and its font size is set by element style tag in the vuestic library */
  .va-input-wrapper__field i.va-icon {
    font-size: 24px !important;
  }
}
</style>
