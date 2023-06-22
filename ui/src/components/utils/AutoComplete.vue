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
          @click="updateResultsVisibility"
          @update:modelValue="updateResultsVisibility"
        />
      </va-form>

      <ul
        v-if="visible"
        class="absolute w-full bg-white border border-solid border-slate-200 shadow-lg rounded rounded-t-none p-2 z-10 max-h-56 overflow-y-scroll overflow-x-hidden"
      >
        <li
          class="pb-2 text-sm border-solid border-b border-slate-200 text-right va-text-secondary"
          v-if="search_results.length"
        >
          Showing {{ search_results.length }} of {{ data.length }} results
        </li>
        <li
          v-for="(item, idx) in search_results"
          :key="idx"
          class="cursor-pointer hover:bg-gray-100 p-2 rounded"
          @click="handleSelect(item)"
        >
          <slot name="filtered" :item="item">
            {{ item[props.displayBy] }}
          </slot>
        </li>
        <li v-if="active_query && search_results.length == 0" class="py-2 px-3">
          None matched
        </li>
      </ul>
    </OnClickOutside>
  </div>
</template>

<script setup>
import { OnClickOutside } from "@vueuse/components";

const props = defineProps({
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
});

const emit = defineEmits(["select"]);

const text = ref("");
const visible = ref(false);

// when there is no text, hide the results ul
// when text is entered, show the results ul
// when clicked outside, hide the results ul
// when clicked on input when there is some text entered, show the results ul
// when clicked on a search result, clear text and hide the results ul

const search_results = computed(() => {
  if (text.value === "") return [];

  const filterFn =
    props.filterFn instanceof Function
      ? props.filterFn(text.value)
      : (item) =>
          (item[props.filterBy] || "")
            .toLowerCase()
            .includes(text.value.toLowerCase());

  return (props.data || []).filter(filterFn);
});

const active_query = computed(() => text.value !== "");

function closeResults() {
  visible.value = false;
}

function updateResultsVisibility() {
  visible.value = active_query.value;
}

function handleSelect(item) {
  text.value = "";
  updateResultsVisibility();
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
