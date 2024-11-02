<template>
  <div class="flex gap-2 search" :style="styles">
    <!-- Search, and search results   -->
    <div class="flex-auto">
      <!-- Container for search controls, and search results table -->
      <div class="flex flex-col gap-2">
        <!-- Container for controls -->
        <div class="flex flex-col gap-2 --controls-height --controls-margin">
          <div class="flex gap-2">
            <!-- Search input -->
            <va-input
              :messages="props.messages"
              :modelValue="props.searchTerm"
              @update:modelValue="
                (val) => {
                  $emit('update:searchTerm', val);
                }
              "
              :placeholder="props.placeholder || 'Type to search'"
              class="flex-auto"
              clearable
              @clear="$emit('reset')"
            >
              <!-- Search icon -->
              <template #prependInner>
                <va-icon class="text-xl" name="search" />
              </template>
            </va-input>

            <!-- Search filters -->
            <div class="flex-none">
              <slot name="filters"></slot>
            </div>
          </div>

          <div class="flex gap-2 flex-wrap">
            <!-- Add Selected -->
            <div class="flex gap-2 items-center">
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
                :disabled="searchResultSelections.length === 0 || props.loading"
              >
                Add
                {{
                  searchResultSelections.length === 0
                    ? "Selected"
                    : searchResultSelections.length
                }}
              </va-button>
            </div>

            <va-chip outline>{{ countLabel }} </va-chip>
          </div>
        </div>

        <!-- Search results table -->
        <va-inner-loading :loading="props.loading">
          <div
            ref="infiniteScrollTarget_search"
            class="max-h-80 overflow-y-auto"
          >
            <va-infinite-scroll
              :load="onScrollToEnd"
              :scroll-target="infiniteScrollTarget_search"
              :disabled="
                props.searchResults.length === props.searchResultCount ||
                props.searchResults.length < props.pageSizeSearch
              "
              :offset="0"
            >
              <va-data-table
                class="results-table"
                v-model="searchResultSelections"
                :items="props.searchResults"
                :columns="_searchResultColumns"
                selectable
                :select-mode="props.selectMode"
              >
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
                    {{
                      fieldValue(rowData, _searchResultColumns[colIndex])
                        .formatted
                    }}
                  </div>
                </template>

                <!-- template for Actions column -->
                <template #cell(actions)="{ rowData }">
                  <va-button
                    :icon="isSelected(rowData) ? 'remove' : 'add'"
                    :color="isSelected(rowData) ? 'danger' : 'success'"
                    size="small"
                    preset="primary"
                    @click="addOrRemove(rowData)"
                    :disabled="
                      searchResultSelections.length > 0 || props.loading
                    "
                  >
                  </va-button>
                </template>
              </va-data-table>
            </va-infinite-scroll>
          </div>
        </va-inner-loading>
      </div>
    </div>

    <va-divider class="flex-none" vertical></va-divider>

    <!-- Selected results -->
    <div class="flex-auto">
      <div class="h-full flex flex-col gap-2">
        <!-- Container for Controls -->
        <div class="flex flex-col gap-2 --controls-height --controls-margin">
          <div class="va-h6 h-9 my-0">
            {{ props.selectedLabel }}
          </div>

          <div class="flex gap-2 flex-wrap">
            <div class="flex gap-2 items-center">
              <va-button
                class="flex-none"
                preset="secondary"
                color="danger"
                border-color="danger"
                icon="remove"
                @click="
                  () => {
                    emit('remove', selectedResultSelections);
                    resetSelectedSelections();
                  }
                "
                :disabled="
                  selectedResultSelections.length === 0 || props.loading
                "
              >
                Remove
                {{
                  selectedResultSelections.length === 0
                    ? "Selected"
                    : selectedResultSelections.length
                }}
              </va-button>
            </div>

            <va-chip outline>
              {{ props.selectedResults.length }} results
            </va-chip>
          </div>
        </div>

        <!-- Selected Results table -->
        <va-inner-loading
          :loading="props.loading"
          class="h-full"
          :class="{
            'selected-table__top-padding--hint-message-provided':
              props.messages.length > 0,
          }"
        >
          <div
            class="flex va-text-danger h-full"
            v-if="props.showError && props.selectedResults.length === 0"
          >
            <va-alert
              dense
              class="my-auto text-xs"
              text-color="danger"
              color="danger"
              icon="warning"
              outline
            >
              {{ selectionRequiredError }}</va-alert
            >
          </div>

          <div
            class="overflow-y-auto selected-table"
            v-if="props.selectedResults.length > 0"
          >
            <va-data-table
              class="results-table"
              v-model="selectedResultSelections"
              :items="props.selectedResults"
              :columns="_selectedResultColumns"
              virtual-scroller
              selectable
              :select-mode="props.selectMode"
            >
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
                  {{
                    fieldValue(rowData, _selectedResultColumns[colIndex])
                      .formatted
                  }}
                </div>
              </template>

              <!-- template for Actions column -->
              <template #cell(actions)="{ rowData }">
                <va-button
                  :icon="isSelected(rowData) ? 'remove' : 'add'"
                  :color="isSelected(rowData) ? 'danger' : 'success'"
                  size="small"
                  preset="primary"
                  @click="addOrRemove(rowData)"
                  :disabled="
                    selectedResultSelections.length > 0 || props.loading
                  "
                >
                </va-button>
              </template>
            </va-data-table>
          </div>
        </va-inner-loading>
      </div>
    </div>
  </div>
</template>

<script setup>
import _ from "lodash";

const props = defineProps({
  messages: {
    type: Array,
  },
  placeholder: {
    type: String,
    default: () => "Type to search",
  },
  searchResults: {
    type: Array,
    default: () => [],
  },
  selectedResults: {
    type: Array,
    default: () => [],
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
  searchResultCount: {
    type: Number,
    required: true,
  },
  searchTerm: {
    type: String,
    default: "",
  },
  selectMode: {
    type: String,
    default: () => "multiple",
  },
  trackBy: {
    type: [Function, String],
    default: "id",
  },
  pageSizeSearch: {
    type: Number,
    default: () => 10,
  },
  controlsMargin: {
    type: String,
  },
  controlsHeight: {
    type: String,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  resource: {
    type: String,
    default: "result",
  },
  error: {
    type: String,
  },
  showError: {
    type: Boolean,
    default: false,
  },
});

const selectionRequiredError = computed(() => {
  if (props.error) {
    return props.error;
  }
  return (
    "Please select " +
    (props.selectMode === "single" ? "a" : "at least one") +
    ` ${props.resource}`
  );
});

const _controlsMargin = toRef(() => props.controlsMargin);
const _controlsHeight = toRef(() => props.controlsHeight);

const styles = computed(() => {
  return {
    "--controls-margin": _controlsMargin.value,
    "--controls-height": _controlsHeight.value,
  };
});

const emit = defineEmits([
  "select",
  "remove",
  "reset",
  "update:searchTerm",
  "scroll-end",
]);

const infiniteScrollTarget_search = ref(null);

const countLabel = computed(() => {
  return `Showing ${props.searchResults.length} of
                      ${props.searchResultCount}
                      ${props.searchTerm !== "" ? "filtered " : ""}
                      results`;
});

const searchResultSelections = ref([]);
const selectedResultSelections = ref([]);

const ACTIONS_COLUMN_CONFIG = {
  key: "actions",
  label: "Actions",
  thAlign: "right",
  tdAlign: "right",
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
    props.selectedResults.findIndex((e) => {
      return getIdentity(e) === getIdentity(result);
    }) > -1
  );
};

/**
 * Given a search result and a display config for one of the columns in the
 * search result table, returns the column's formatted value.
 * @param rowData the search result to format
 * @param columnConfig the display config for a column in the search results table. This object
 * corresponds to the display config for this column that was provided to <va-data-table> via the `columns` prop.
 * @returns {*} the formatted value of the search result
 */
const fieldValue = (rowData, columnConfig) => {
  return {
    formatted:
      typeof columnConfig["formatFn"] === "function"
        ? columnConfig["formatFn"](rowData[columnConfig["key"]])
        : rowData[columnConfig["key"]],
    raw: rowData[columnConfig["key"]],
  };
};

const templateName = (field) => `cell(${field["key"]})`;

const onScrollToEnd = () => {
  emit("scroll-end");
  // This method returns a Promise simply because <va-infinite-scroll>'s
  // expects its `load` callback prop to always return a Promise. The Promise in
  // this instance doesn't do anything, and the actual fetching of subsequent
  // results is handled by the client, who listens to the `scroll-end` event.
  return new Promise((resolve) => {
    resolve();
  });
};

// resets search result selections
const resetSearchSelections = () => {
  searchResultSelections.value = [];
};

// resets selected result selections
const resetSelectedSelections = () => {
  selectedResultSelections.value = [];
};

const addOrRemove = (rowData) => {
  if (!isSelected(rowData)) {
    emit("select", [rowData]);
  } else {
    emit("remove", [rowData]);
  }
  resetSearchSelections();
  resetSelectedSelections();
};
</script>

<style lang="scss">
.search {
  .results-table {
    --va-data-table-cell-padding: 3px;
    //--va-data-table-selectable-cell-width: 40px;
  }

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

  .search-table {
    height: 320px;
  }

  .selected-table {
    height: 320px;
  }

  .selected-table__top-padding--hint-message-provided {
    padding-top: 19px;
  }
}
</style>
