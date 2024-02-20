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
});

const emit = defineEmits(["select", "update:modelValue", "open", "close"]);

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

const display = (item) => {
  return typeof props.displayBy === "string"
    ? item[props.displayBy]
    : props.displayBy(item);
};

function closeResults() {
  visible.value = false;
  emit("close");
}

function openResults() {
  visible.value = true;
  emit("open");
}

// function onTextChange() {
//   if (props.async) {
//     console.log(`emitting input: ${text.value}`);
//     emit("input", text.value);
//   }
// }

function handleSelect(item) {
  // text.value = "";
  emit("update:modelValue", display(item));
  emit("select", item);
  closeResults();
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
