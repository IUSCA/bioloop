<template>
  <div class="flex gap-2 search" :style="styles">
    <!-- Search, and results   -->
    <div>
      <!-- Container for search controls, and search results table -->
      <div class="flex flex-col gap-2">
        <!-- Container for controls -->
        <div class="flex flex-col gap-2 --controls-height --controls-margin">
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

          <div class="flex gap-2 flex-wrap">
            <!-- Add Selected / Delete Selected -->
            <div class="flex flex-auto gap-2 items-center">
              <va-button
                class="flex-none"
                preset="secondary"
                color="success"
                border-color="success"
                icon="add"
                @click="
                  () => {
                    emit('select', searchResultSelections);
                    resetSearchSelections();
                  }
                "
              >
                Add Selected
              </va-button>

              <div class="flex-none">
                <va-chip v-if="searchResultSelections.length > 0">
                  Selected: {{ searchResultSelections.length }}
                </va-chip>
              </div>
            </div>
          </div>
        </div>

        <!-- Search results table -->
        <div ref="infiniteScrollTarget_search" class="max-h-80 overflow-y-auto">
          <va-infinite-scroll
            :load="loadNextSearchResults"
            :scroll-target="infiniteScrollTarget_search"
            :disabled="
              searchResults.length === totalResults ||
              searchResults.length < props.pageSizeSearch
            "
          >
            <va-data-table
              v-model="searchResultSelections"
              :items="searchResults"
              :columns="_searchResultColumns"
              selectable
              select-mode="multiple"
            >
              <template #headerPrepend>
                <tr>
                  <th class="overflow-hidden" colspan="6">
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
                  class="overflow-hidden"
                >
                </slot>
                <div v-else class="overflow-hidden">
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
                  :disabled="searchResultSelections.length > 0"
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
      <div class="flex flex-col gap-2">
        <!-- Container for Controls -->
        <div class="flex flex-col gap-2 --controls-height --controls-margin">
          <div class="va-h6 h-9 my-0">
            {{ props.selectedLabel }}
          </div>

          <div class="flex gap-2 items-center">
            <div class="flex gap-2 flex-auto items-center">
              <va-button
                class="flex-none"
                preset="secondary"
                color="danger"
                border-color="danger"
                icon="delete"
                @click="
                  () => {
                    emit('remove', selectedResultSelections);
                    resetSelectedSelections();
                  }
                "
              >
                Delete Selected
              </va-button>

              <div class="flex-none">
                <va-chip v-if="selectedResultSelections.length > 0">
                  Selected: {{ selectedResultSelections.length }}
                </va-chip>
              </div>
            </div>
          </div>
        </div>

        <!-- Selected Results table -->
        <div class="overflow-y-auto h-80">
          <va-data-table
            v-model="selectedResultSelections"
            v-if="props.selectedResults.length > 0"
            :items="props.selectedResults"
            :columns="_selectedResultColumns"
            virtual-scroller
            selectable
            select-mode="multiple"
          >
            <template #headerPrepend>
              <tr class="overflow-hidden">
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
                class="overflow-hidden"
              >
              </slot>
              <div v-else class="overflow-hidden">
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
                :disabled="selectedResultSelections.length > 0"
              >
              </va-button>
            </template>
          </va-data-table>
        </div>
      </div>
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
    required: true,
  },
  pageSizeSearch: {
    type: Number,
    default: () => 5,
  },
  selectedResults: {
    type: Array,
    default: () => [],
  },
  tableMargin: {
    type: String,
  },
  controlsHeight: {
    type: String,
  },
});

const _tableMargin = toRef(() => props.tableMargin);
const _controlsHeight = toRef(() => props.controlsHeight);

const styles = computed(() => {
  return {
    "--controls-margin": _tableMargin.value,
    "--controls-height": _controlsHeight.value,
  };
});

const emit = defineEmits(["select", "remove", "reset"]);

const infiniteScrollTarget_search = ref(null);

const page = ref(1);
const skip = computed(() => {
  return props.pageSizeSearch * (page.value - 1);
});

const searchTerm = ref("");
const searchResults = ref([]);
const totalResults = ref(0);
const searchResultSelections = ref([]);
const selectedResultSelections = ref([]);

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
    limit: props.pageSizeSearch,
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

// resets search result selections
const resetSearchSelections = () => {
  searchResultSelections.value = [];
};

// resets selected result selections
const resetSelectedSelections = () => {
  selectedResultSelections.value = [];
};

const resetSearchState = () => {
  resetSearchSelections();
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
        ? props.countBy(res.data)
        : typeof props.countBy === "string"
          ? _.get(res.data, props.countBy)
          : res.data.length;
  });
};

const loadNextSearchResults = () => {
  page.value += 1; // increase page value for offset recalculation
  return loadResults();
};

const addOrDelete = (rowData) => {
  if (!isSelected(rowData)) {
    emit("select", [rowData]);
  } else {
    emit("remove", [rowData]);
  }
  resetSearchSelections();
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

  .--controls-margin {
    margin-bottom: var(--controls-margin);
  }

  .--controls-height {
    height: var(--controls-height);
  }
}
</style>
