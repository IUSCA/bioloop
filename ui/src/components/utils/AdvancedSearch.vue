<template>
  <div class="flex gap-2 search">
    <!-- Search, and results   -->
    <div class="flex-none">
      <div class="flex flex-col gap-3">
        <div class="flex gap-2">
          <!-- Search input -->
          <va-input
            v-model="searchTerm"
            :placeholder="props.placeholder || 'Type to search'"
          >
            <template #prependInner>
              <va-icon name="search" class="icon"></va-icon>
            </template>
            <template #appendInner>
              <va-icon name="highlight_off" class="icon"></va-icon>
            </template>
          </va-input>

          <!-- Search filters -->
          <div class="flex-none">
            <slot name="filters"></slot>
          </div>
        </div>

        <div class="flex gap-2">
          <!-- Counts -->
          <div class="flex flex-col">
            <div>
              Showing {{ searchResults.length }} of {{ totalResults }}
              {{ searchTerm !== "" ? "filtered " : "" }}
              results
            </div>
            <div v-if="selectedSearchResults.length > 0">
              {{ selectedSearchResults.length }} selected
            </div>
          </div>

          <!-- Add Selected / Delete Selected -->
          <div class="flex-none">
            <div class="flex gap-2">
              <va-button
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
          </div>
        </div>

        <!-- Search results table -->
        <div ref="infiniteScrollTarget" class="max-h-64 overflow-y-auto">
          <va-infinite-scroll
            :load="loadMore"
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
            >
              <template
                v-for="(templateName, colIndex) in _searchResultColumns
                  .filter((e) => e.key !== 'actions')
                  .map((e) => e.template)"
                #[templateName]="{ rowData }"
                :key="colIndex"
              >
                <div>
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
                </div>
              </template>

              <template #cell(actions)="{ rowData }">
                <div class="flex gap-2">
                  <va-button
                    icon="add"
                    color="success"
                    size="small"
                    preset="primary"
                    :disabled="isSelected(rowData)"
                    @click="
                      () => {
                        if (!isSelected(rowData)) {
                          emit('select', [rowData]);
                          resetSelections();
                        }
                      }
                    "
                  >
                  </va-button>
                  <va-button
                    icon="delete"
                    size="small"
                    preset="primary"
                    color="danger"
                    :disabled="!isSelected(rowData)"
                    @click="
                      () => {
                        emit('remove', [rowData]);
                        resetSelections();
                      }
                    "
                  >
                  </va-button>
                </div>
              </template>
            </va-data-table>
          </va-infinite-scroll>
        </div>
      </div>
    </div>

    <va-divider class="flex-none" vertical></va-divider>

    <!-- Selected results -->
    <div>
      <div class="va-h6">{{ props.selectedLabel }}</div>
      <div>
        {{ maybePluralize(props.selectedResults.length, props.resource) }}
        selected
      </div>

      <va-data-table
        :items="props.selectedResults"
        :columns="_selectedResultColumns"
      >
        <template
          v-for="(templateName, colIndex) in _selectedResultColumns.map(
            (e) => e.template,
          )"
          #[templateName]="{ rowData }"
          :key="colIndex"
        >
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
      </va-data-table>
    </div>
  </div>
</template>

<script setup>
import _ from "lodash";
import { maybePluralize } from "@/services/utils";

const resetSelections = () => {
  // reset selected search results
  selectedSearchResults.value = [];
};

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

const emit = defineEmits(["select", "remove"]);

const infiniteScrollTarget = ref(null);

const page = ref(1);
const skip = computed(() => {
  return props.pageSize * (page.value - 1);
});

const searchTerm = ref("");
const searchResults = ref([]);
const totalResults = ref(0);
const selectedSearchResults = ref([]);

watch(selectedSearchResults, () => {
  console.dir(selectedSearchResults.value, { depth: null });
});

const _searchResultColumns = computed(() => {
  return props.searchResultColumns
    .concat({
      key: "actions",
      label: "Actions",
    })
    .map((e) => ({ ...e, template: templateName(e) }));
});

const _selectedResultColumns = computed(() => {
  return props.selectedResultColumns.map((e) => ({
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

const loadResults = () => {
  return props.fetchFn(fetchQuery.value).then((res) => {
    // debugger;
    let results;
    if (!props.resultsBy) {
      results = res.data;
    } else if (typeof props.resultsBy === "function") {
      results = props.resultsBy(res.data);
    } else {
      results = _.get(res.data, props.resultsBy);
    }
    searchResults.value = searchResults.value.concat(results);

    if (!props.countBy) {
      totalResults.value = res.data.length;
    } else if (typeof props.countBy === "function") {
      totalResults.value = props.countBy(res.data);
    } else {
      totalResults.value = _.get(res.data, props.countBy);
    }
  });
};

const loadMore = () => {
  page.value += 1;
  return loadResults();
};

watch([searchTerm, _query], () => {
  // reset search results
  searchResults.value = [];
  // reset selected search results
  selectedSearchResults.value = [];
  // reset page value
  page.value = 1;
  loadResults();
});

onMounted(() => {
  loadResults();
});
</script>

<style lang="scss">
.search {
  .icon {
    color: var(--va-secondary);
  }
}
</style>
