<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<!-- eslint-disable vuejs-accessibility/click-events-have-key-events -->
<template>
  <div class="relative">
    <OnClickOutside @trigger="closeDropdown">
      <va-form>
        <va-input
          clearable
          :placeholder="props.placeholder"
          v-model="query"
          class="w-full autocomplete-search-input"
          @focus="openDropdown"
          @keydown="handleKeydown"
          @input="handleInput"
          @clear="onClear"
        >
          <template #prependInner>
            <i-mdi:magnify />
          </template>
        </va-input>
      </va-form>

      <!-- Dropdown -->
      <div
        v-if="isOpen"
        class="absolute w-full bg-white dark:bg-gray-800 border border-solid border-slate-200 dark:border-slate-700 shadow-lg rounded rounded-t-none px-2 z-50 max-h-[25rem] overflow-y-auto"
      >
        <!-- Recent Searches Section -->
        <div v-if="recent.length > 0 && query === ''" class="my-2">
          <div class="flex justify-between items-center mb-1">
            <h6
              class="text-sm font-medium text-gray-600 dark:text-gray-400 px-1"
            >
              Recent Searches
            </h6>
            <button
              @click="clearAllRecent"
              class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2"
            >
              Clear All
            </button>
          </div>
          <div
            role="button"
            tabindex="0"
            v-for="(term, index) in recent"
            :key="`recent-${index}`"
            :class="[
              'flex items-center justify-between pl-1 pr-2 py-1 rounded cursor-pointer',
              'hover:bg-gray-100 dark:hover:bg-gray-700',
              highlightIndex === index ? 'bg-gray-100 dark:bg-gray-700' : '',
            ]"
            @click="selectTerm(term)"
          >
            <slot name="recent-item" :item="term" :index="index">
              <div class="flex items-center gap-2 flex-1">
                <Icon
                  :icon="props.recentIcon"
                  class="text-gray-500 dark:text-gray-400 flex-none"
                />
                <span class="flex-1">{{ term }}</span>
              </div>
            </slot>
            <button
              @click.stop="removeRecent(term)"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2"
            >
              <i-mdi:close class="text-sm" />
            </button>
          </div>
        </div>

        <!-- Suggested Searches Section -->
        <div v-if="suggested.length > 0 && query === ''" class="my-2">
          <h6
            class="text-sm font-medium text-gray-600 dark:text-gray-400 px-1 mb-1"
          >
            Suggested Searches
          </h6>
          <div
            role="button"
            tabindex="0"
            v-for="(term, index) in suggested"
            :key="`suggested-${index}`"
            :class="[
              'flex items-center gap-2 pl-1 pr-2 py-1 rounded cursor-pointer',
              'hover:bg-gray-100 dark:hover:bg-gray-700',
              highlightIndex === recent.length + index
                ? 'bg-gray-100 dark:bg-gray-700'
                : '',
            ]"
            @click="selectTerm(term)"
          >
            <slot name="suggested-item" :item="term" :index="index">
              <Icon
                :icon="props.suggestedIcon"
                class="text-gray-500 dark:text-gray-400 flex-none"
              />
              <span>{{ term }}</span>
            </slot>
          </div>
        </div>

        <!-- Autocomplete Results Section -->
        <div v-if="query !== '' && props.autocompleteFn">
          <div
            v-if="loading && props.showLoading"
            class="p-4 text-center text-gray-500 dark:text-gray-400"
          >
            <span>Searching...</span>
          </div>
          <div
            v-if="!loading && results.length === 0"
            class="p-4 text-center text-gray-500 dark:text-gray-400"
          >
            <span class="flex gap-2 items-center justify-center">
              <i-mdi:magnify-remove-outline class="flex-none text-xl" />
              <span class="flex-none">No results found</span>
            </span>
          </div>
          <div
            v-if="(!loading || !props.showLoading) && results.length > 0"
            class="my-1"
          >
            <div
              v-for="(result, index) in results"
              :key="`result-${index}`"
              :class="[
                'flex items-center gap-2 pl-1 pr-2 py-1 rounded cursor-pointer',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                highlightIndex === index ? 'bg-gray-100 dark:bg-gray-700' : '',
              ]"
              @click="selectResult(result)"
            >
              <slot
                name="result-item"
                :item="result"
                :index="index"
                :query="query"
              >
                <i-mdi:magnify
                  class="text-blue-500 dark:text-blue-400 text-sm flex-none"
                />
                <span>{{ result }}</span>
              </slot>
            </div>
          </div>
        </div>
      </div>
    </OnClickOutside>
  </div>
</template>

<script setup>
import { OnClickOutside } from "@vueuse/components";
import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { computed, nextTick, onMounted, ref, watch } from "vue";

// Props
const props = defineProps({
  suggested: {
    type: Array,
    default: () => [],
  },
  autocompleteFn: {
    type: Function,
    default: null,
  },
  maxRecent: {
    type: Number,
    default: 5,
  },
  maxAutocomplete: {
    type: Number,
    default: 10,
  },
  storageKey: {
    type: String,
    default: "",
  },
  placeholder: {
    type: String,
    default: "Search...",
  },
  recentIcon: {
    type: String,
    default: "mdi:history",
  },
  suggestedIcon: {
    type: String,
    default: "mdi:lightbulb-on-outline",
  },
  debounceMs: {
    type: Number,
    default: 250,
  },
  showLoading: {
    type: Boolean,
    default: true,
  },
  initialValue: {
    type: String,
    default: "",
  },
  valueBy: {
    type: String,
    default: null,
  },
});

// Emits
const emit = defineEmits(["select", "submit", "clear-recent", "clear"]);

// Reactive state
const query = defineModel({
  type: String,
  default: "",
});
const isOpen = ref(false);
const recent = props.storageKey
  ? useLocalStorage(props.storageKey, [])
  : ref([]);
const results = ref([]);
const highlightIndex = ref(null);
const loading = ref(false);

// Add term to recent searches
const addToRecent = (term) => {
  if (!props.storageKey || !term || typeof term !== "string") return;

  // Remove if already exists
  const filtered = recent.value.filter((item) => item !== term);

  // Add to beginning
  filtered.unshift(term);

  // Limit to maxRecent
  recent.value = filtered.slice(0, props.maxRecent);
};

// Remove specific recent search
const removeRecent = (term) => {
  if (!props.storageKey) return;
  recent.value = recent.value.filter((item) => item !== term);
  emit("clear-recent", term);
};

// Clear all recent searches
const clearAllRecent = () => {
  if (!props.storageKey) return;
  recent.value = [];
  emit("clear-recent");
};

// Debounced autocomplete function
const debouncedAutocomplete = useDebounceFn(async (searchQuery) => {
  if (!props.autocompleteFn) {
    loading.value = false;
    return;
  }

  try {
    const fetchedResults = await props.autocompleteFn(searchQuery);
    results.value = Array.isArray(fetchedResults)
      ? fetchedResults.slice(0, props.maxAutocomplete)
      : [];
  } catch (error) {
    console.error("Autocomplete fetch failed:", error);
    results.value = [];
  } finally {
    loading.value = false;
  }
}, props.debounceMs);

// Watch query changes for autocomplete
watch(query, (newQuery) => {
  if (newQuery.trim() && props.autocompleteFn) {
    loading.value = true;
    debouncedAutocomplete(newQuery);
  } else {
    results.value = [];
    loading.value = false;
  }
  highlightIndex.value = null;
});

// Handle input events
const handleInput = () => {
  if (!isOpen.value) {
    openDropdown();
  }
};

// Open dropdown
const openDropdown = () => {
  isOpen.value = true;
  highlightIndex.value = null;
};

// Close dropdown
const closeDropdown = () => {
  isOpen.value = false;
  highlightIndex.value = null;
};

// Select a term from recent/suggested (updates model)
const selectTerm = (term) => {
  query.value = term;
  addToRecent(term);
  closeDropdown();
  emit("select", query.value);

  // Blur the input to prevent dropdown from reopening when window regains focus
  nextTick(() => {
    const input = document.querySelector(
      ".autocomplete-search-input .va-input__content__input",
    );
    if (input) {
      input.blur();
    }
  });
};

// Select a result from autocomplete
// clears query and closes dropdown
// emits the selected value (or a specific property if valueBy is set)
// adds to recent searches the query that led to the selection
const selectResult = (result) => {
  let valueToSet = result;
  if (typeof result === "object" && result !== null) {
    valueToSet = props.valueBy == null ? result : result[props.valueBy];
  }
  emit("select", valueToSet);

  // Add the query that led to the selection to recent searches
  addToRecent(query.value);

  // clear query and close dropdown
  query.value = "";
  closeDropdown();

  // Blur the input to prevent dropdown from reopening when window regains focus
  nextTick(() => {
    const input = document.querySelector(
      ".autocomplete-search-input .va-input__content__input",
    );
    if (input) {
      input.blur();
    }
  });
};

// Submit current query
const submitQuery = () => {
  if (query.value.trim()) {
    addToRecent(query.value.trim());
    emit("submit", query.value.trim());
    closeDropdown();
  }
};

// Handle clear event
const onClear = () => {
  emit("clear");
};

// Get all selectable items for keyboard navigation
const getAllSelectableItems = computed(() => {
  const items = [];

  if (query.value === "") {
    // Add recent searches
    items.push(...recent.value);
    // Add suggested searches
    items.push(...props.suggested);
  } else {
    // Add autocomplete results
    items.push(...results.value);
  }

  return items;
});

// Handle keyboard navigation
const handleKeydown = (event) => {
  const items = getAllSelectableItems.value;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (highlightIndex.value === null) {
        highlightIndex.value = 0;
      } else {
        highlightIndex.value = Math.min(
          highlightIndex.value + 1,
          items.length - 1,
        );
      }
      break;

    case "ArrowUp":
      event.preventDefault();
      if (highlightIndex.value === null) {
        highlightIndex.value = items.length - 1;
      } else {
        highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
      }
      break;

    case "Enter":
      event.preventDefault();
      if (highlightIndex.value !== null && items[highlightIndex.value]) {
        const item = items[highlightIndex.value];
        if (query.value === "") {
          selectTerm(item);
        } else {
          selectResult(item);
        }
      } else {
        submitQuery();
      }
      break;

    case "Escape":
      event.preventDefault();
      closeDropdown();
      break;
  }
};

// Initialize component
onMounted(() => {
  // Set autocomplete attribute on the input
  nextTick(() => {
    const input = document.querySelector(
      ".autocomplete-search-input .va-input__content__input",
    );
    if (input) {
      input.setAttribute("autocomplete", "off");
    }
  });

  // Set initial value if provided
  if (props.initialValue) {
    query.value = props.initialValue;
  }
});
</script>

<style lang="scss">
.autocomplete-search-input {
  /* Clear icon is too big and its font size is set by element style tag in the vuestic library */
  .va-input-wrapper__field i.va-icon {
    font-size: 24px !important;
  }
}
</style>
