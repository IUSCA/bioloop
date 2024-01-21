<template>
  <div class="flex gap-2 search">
    <!-- Search, and results   -->
    <div>
      <!-- Container for search controls, and search results table -->
      <div class="flex flex-col gap-3">
        <!--        div class="-->
        <div class="flex gap-2">
          <!-- Search input -->
          <va-input
            v-model="searchTerm"
            :placeholder="props.placeholder || 'Type to search'"
            class="flex-auto"
          >
            <!-- Search icon -->
            <template #prependInner>
              <va-icon name="search" class="icon"></va-icon>
            </template>
            <!-- Clear button -->
            <template #appendInner>
              <va-popover message="Reset Filters">
                <va-button
                  preset="plain"
                  color="secondary"
                  icon="highlight_off"
                  @click="
                    () => {
                      searchTerm = ''; // watcher on searchTerm takes care of resetting the search state
                      emit('reset');
                    }
                  "
                />
              </va-popover>
            </template>
          </va-input>

          <!-- Search filters -->
          <div class="flex-none">
            <slot name="filters"></slot>
          </div>
        </div>

        <div class="flex gap-2 flex-wrap items-center">
          <!-- Add Selected / Delete Selected -->
          <div class="flex gap-2">
            <va-button
              class="flex-none"
              preset="secondary"
              color="success"
              border-color="success"
              icon="add"
              @click="
                () => {
                  emit('select', selectedSearchResults);
                  resetSelections();
                }
              "
            >
              Add Selected
            </va-button>
            <va-button
              class="flex-none"
              preset="secondary"
              color="danger"
              border-color="danger"
              icon="delete"
              @click="
                () => {
                  emit('remove', selectedSearchResults);
                  resetSelections();
                }
              "
            >
              Delete Selected
            </va-button>
          </div>

          <div class="flex-none">
            <va-chip v-if="selectedSearchResults.length > 0">
              Selected: {{ selectedSearchResults.length }}
            </va-chip>
          </div>
        </div>

        <!-- Search results table -->
        <div ref="infiniteScrollTarget" class="h-80 mt-4 overflow-y-auto">
          <va-infinite-scroll
            :load="loadMoreResults"
            :scroll-target="infiniteScrollTarget"
            :disabled="
              searchResults.length === totalResults ||
              searchResults.length < props.pageSize
            "
          >
            <va-data-table
              v-model="selectedSearchResults"
              :items="searchResults"
              :columns="_searchResultColumns"
              selectable
              select-mode="multiple"
              sticky-header
              footer-clone
              sticky-footer
              height="320px"
            >
              <template #headerPrepend>
                <tr>
                  <th colspan="6">
                    <span class="selected-count">
                      Showing {{ searchResults.length }} of {{ totalResults }}
                      {{ searchTerm !== "" ? "filtered " : "" }}
                      results
                    </span>
                  </th>
                </tr>
              </template>

              <!-- dynamically generated templates for displaying columns of the search results table -->
              <template
                v-for="(templateName, colIndex) in _searchResultColumns
                  .filter((e) => e.key !== 'actions')
                  .map((e) => e.template)"
                #[templateName]="{ rowData }"
                :key="colIndex"
              >
                <!-- Wrap column's value in the provided slot, or display plain value -->
                <slot
                  v-if="_searchResultColumns[colIndex].slotted"
                  :name="
                    _searchResultColumns[colIndex].slot ||
                    _searchResultColumns[colIndex].key
                  "
                  :value="fieldValue(rowData, _searchResultColumns[colIndex])"
                >
                </slot>
                <div v-else>
                  {{ fieldValue(rowData, _searchResultColumns[colIndex]) }}
                </div>
              </template>

              <!-- template for Actions column -->
              <template #cell(actions)="{ rowData }">
                <va-button
                  :icon="isSelected(rowData) ? 'delete' : 'add'"
                  :color="isSelected(rowData) ? 'danger' : 'success'"
                  size="small"
                  preset="primary"
                  @click="addOrDelete(rowData)"
                >
                </va-button>
              </template>
            </va-data-table>
          </va-infinite-scroll>
        </div>
      </div>
    </div>

    <va-divider class="flex-none" vertical></va-divider>

    <!-- Selected results -->
    <div>
      <div class="va-h6">
        {{ props.selectedLabel }}
      </div>

      <va-data-table
        class="selected-results"
        v-if="props.selectedResults.length > 0"
        :items="props.selectedResults"
        :columns="_selectedResultColumns"
        sticky-header
        footer-clone
        sticky-footer
        height="320px"
      >
        <template #headerPrepend>
          <tr>
            <th colspan="6">
              <span class="selected-count">
                Selected {{ props.selectedResults.length }} results
              </span>
            </th>
          </tr>
        </template>

        <!-- dynamically generated templates for displaying columns of the selected results table  -->
        <template
          v-for="(templateName, colIndex) in _selectedResultColumns
            .filter((e) => e.key !== 'actions')
            .map((e) => e.template)"
          #[templateName]="{ rowData }"
          :key="colIndex"
        >
          <!-- Wrap column's value in the provided slot, or display plain value -->
          <slot
            v-if="_selectedResultColumns[colIndex].slotted"
            :name="
              _selectedResultColumns[colIndex].slot ||
              _selectedResultColumns[colIndex].key
            "
            :value="fieldValue(rowData, _selectedResultColumns[colIndex])"
          >
          </slot>
          <div v-else>
            {{ fieldValue(rowData, _selectedResultColumns[colIndex]) }}
          </div>
        </template>

        <!-- template for Actions column -->
        <template #cell(actions)="{ rowData }">
          <va-button
            :icon="isSelected(rowData) ? 'delete' : 'add'"
            :color="isSelected(rowData) ? 'danger' : 'success'"
            size="small"
            preset="primary"
            @click="addOrDelete(rowData)"
          >
          </va-button>
        </template>
      </va-data-table>
    </div>
  </div>
</template>

<script setup>
import _ from "lodash";

const props = defineProps({
  placeholder: {
    type: String,
    default: () => "Type to search",
  },
  query: {
    type: Object,
  },
  selectedLabel: {
    type: String,
    default: () => "Selected Results",
  },
  searchResultColumns: {
    type: Array,
    required: true,
  },
  selectedResultColumns: {
    type: Array,
    required: true,
  },
  trackBy: {
    type: [Function, String],
    default: "id",
  },
  fetchFn: {
    type: Function,
    required: true,
  },
  searchField: {
    type: String,
    required: true,
  },
  resultsBy: {
    type: [String, Function],
  },
  countBy: {
    type: [String, Function],
  },
  pageSize: {
    type: Number,
    required: true,
  },
  selectedResults: {
    type: Array,
    default: () => [],
  },
  resource: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["select", "remove", "reset"]);

const infiniteScrollTarget = ref(null);

const page = ref(1);
const skip = computed(() => {
  return props.pageSize * (page.value - 1);
});

const searchTerm = ref("");
const searchResults = ref([]);
const totalResults = ref(0);
const selectedSearchResults = ref([]);

const ACTIONS_COLUMN_CONFIG = {
  key: "actions",
  label: "Actions",
};

const _searchResultColumns = computed(() => {
  return props.searchResultColumns
    .concat(ACTIONS_COLUMN_CONFIG)
    .map((e) => ({ ...e, template: templateName(e) }));
});

const _selectedResultColumns = computed(() => {
  return props.selectedResultColumns.concat(ACTIONS_COLUMN_CONFIG).map((e) => ({
    ...e,
    template: templateName(e),
  }));
});

const batchingQuery = computed(() => {
  return {
    offset: skip.value,
    limit: props.pageSize,
  };
});

const _query = toRef(() => props.query);

const fetchQuery = computed(() => {
  return {
    ...(searchTerm.value && { [props.searchField]: searchTerm.value }),
    ..._query.value,
    ...batchingQuery.value,
  };
});

const getIdentity = (result) => {
  return typeof props.trackBy === "function"
    ? props.trackBy(result)
    : _.get(result, props.trackBy);
};

/**
 * determines if a search result is selected
 * @param result the search result to check for selection
 * @returns {boolean} whether or not the search result is selected
 */
const isSelected = (result) => {
  return (
    props.selectedResults.findIndex(
      (e) => getIdentity(e) === getIdentity(result),
    ) > -1
  );
};

/**
 * Given a search result and a display config for one of the columns in the search result table,
 * returns the column's formatted value.
 * @param rowData the search result to format
 * @param columnConfig the display config for a column in the search results table. This object
 * corresponds to the display config for this column that was provided to <va-data-table> via the `columns` prop.
 * @returns {*} the formatted value of the search result
 */
const fieldValue = (rowData, columnConfig) => {
  return columnConfig["formatFn"]
    ? columnConfig["formatFn"](rowData[columnConfig["key"]])
    : rowData[columnConfig["key"]];
};

const templateName = (field) => `cell(${field["key"]})`;

// resets selected search results
const resetSelections = () => {
  selectedSearchResults.value = [];
};

const resetSearchState = () => {
  resetSelections();
  // reset search results
  searchResults.value = [];
  // reset page value
  page.value = 1;
  // load initial set of search results
  loadResults();
};

const loadResults = () => {
  return props.fetchFn(fetchQuery.value).then((res) => {
    let results =
      typeof props.resultsBy === "function"
        ? props.resultsBy(res.data)
        : typeof props.resultsBy === "string"
          ? _.get(res.data, props.resultsBy)
          : res.data;
    searchResults.value = searchResults.value.concat(results);

    totalResults.value =
      typeof props.countBy === "function"
        ? (totalResults.value = props.countBy(res.data))
        : typeof props.countBy === "string"
          ? _.get(res.data, props.countBy)
          : res.data.length;
  });
};

const loadMoreResults = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const addOrDelete = (rowData) => {
  if (!isSelected(rowData)) {
    emit("select", [rowData]);
  } else {
    emit("remove", [rowData]);
  }
  resetSelections();
};

watch([searchTerm, _query], () => {
  resetSearchState();
});

onMounted(() => {
  loadResults();
});
</script>

<style lang="scss">
.search {
  --va-data-table-thead-background: var(--va-background-secondary);
  --va-data-table-tfoot-background: var(--va-background-secondary);

  .icon {
    color: var(--va-secondary);
  }

  .selected-count {
    color: var(--va-secondary);
  }

  .selected-results {
    margin-top: 90px;
  }
}
</style>
