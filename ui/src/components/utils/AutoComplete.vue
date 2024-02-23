<!-- Adapted from and improved upon https://stevencotterill.com/articles/how-to-build-an-autocomplete-field-with-vue-3 -->
<template>
  <div class="relative">
    <OnClickOutside @trigger="closeResults">
      <va-form>
        <va-input
          outline
          clearable
          type="text"
          :placeholder="props.placeholder"
          v-model="text"
          class="w-full autocomplete-input"
          @click="openResults"
          @clear="
            () => {
              setHasSelectedResult(false);
              closeResults();
            }
          "
          @input="setHasSelectedResult(false)"
          :error="props.required && props.errorMessage"
          :error-message="props.errorMessage"
        />
      </va-form>

      <ul
        v-if="visible"
        class="absolute w-full bg-white dark:bg-gray-900 border border-solid border-slate-200 dark:border-slate-800 shadow-lg rounded rounded-t-none p-2 z-10 max-h-56 overflow-y-scroll overflow-x-hidden"
      >
        <li
          class="pb-2 text-sm border-solid border-b border-slate-200 dark:border-slate-800 text-right va-text-secondary"
          v-if="search_results.length"
        >
          Showing {{ search_results.length }} of {{ data.length }} results
        </li>
        <li v-for="(item, idx) in search_results" :key="idx">
          <button
            class="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-2 rounded w-full text-left"
            @click="handleSelect(item)"
          >
            <slot name="filtered" :item="item">
              {{ display(item) }}
            </slot>
          </button>
        </li>
        <li v-if="search_results.length == 0" class="py-2 px-3">
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
  async: {
    type: Boolean,
    default: false,
  },
  modelValue: {
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
    type: [String, Function],
    default: "name",
  },
  errorMessage: {
    type: String,
  },
  required: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["select", "update:modelValue", "open", "close"]);

const hasSelectedResult = ref(false);

const setHasSelectedResult = (value) => {
  console.log("AutoComplete: setHasSelectedResult() BEGIN");
  hasSelectedResult.value = value;
  console.log(`hasSelectedResult:  ${hasSelectedResult.value}`);
  console.log("AutoComplete: setHasSelectedResult() END");
};

defineExpose({
  hasSelectedResult,
});

const text = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit("update:modelValue", value);
  },
});
const visible = ref(false);

// when clicked outside, hide the results ul
// when clicked on input show the results ul
// when clicked on a search result, clear text and hide the results ul

const search_results = computed(() => {
  console.log(`AutoComplete: search_results COMPUTED: BEGIN`);
  console.log(`AutoComplete: search_results COMPUTED: END`);

  if (text.value === "" || props.async) return props.data;

  console.log(
    `AutoComplete: search_results COMPUTED: did not early return: BEGIN`,
  );
  const filterFn =
    props.filterFn instanceof Function
      ? props.filterFn(text.value)
      : (item) =>
          (item[props.filterBy] || "")
            .toLowerCase()
            .includes(text.value.toLowerCase());

  console.log(
    `AutoComplete: search_results COMPUTED: did not early return: END`,
  );
  return (props.data || []).filter(filterFn);
});

const display = (item) => {
  console.log(`AutoComplete, display(): BEGIN, item:`);
  console.log(item);
  console.log(`AutoComplete, display(): END`);
  return typeof props.displayBy === "string"
    ? item[props.displayBy]
    : props.displayBy(item);
};

function closeResults({ selectedItem = null } = {}) {
  console.log(`AutoComplete, closeResults(): BEGIN`);
  visible.value = false;
  console.log(`AutoComplete, closeResults(): selectedItem`);
  console.log(selectedItem);
  resolveSearch({ selectedItem });
  emit("close");
  console.log(`AutoComplete, closeResults(): END`);
}

function openResults() {
  console.log(`AutoComplete, openResults(): BEGIN`);
  visible.value = true;
  emit("open");
  console.log(`AutoComplete, openResults(): END`);
}

function resolveSearch({ selectedItem = null } = {}) {
  console.log(`AutoComplete, resolveSearch(): BEGIN`);
  console.log(selectedItem);
  console.log(`hasSelectedResult.value: ${hasSelectedResult.value}`);
  const displayedItem = display(selectedItem);
  console.log(`displayedItem: ${displayedItem}`);
  emit("update:modelValue", !hasSelectedResult.value ? "" : displayedItem);
  emit("select", !hasSelectedResult.value ? "" : displayedItem);
  console.log(`AutoComplete, resolveSearch(): END`);
}

function handleSelect(item) {
  console.log(`AutoComplete, handleSelect(): BEGIN`);
  console.log(`item`);
  console.log(item);
  setHasSelectedResult(true);
  console.log(`hasSelectedResult.value: ${hasSelectedResult.value}`);
  // resolveSearch(item);
  closeResults({ selectedItem: item });
  console.log(`AutoComplete, handleSelect(): END`);
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
