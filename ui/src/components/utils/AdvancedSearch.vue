<template>
  <div class="flex gap-2 search">
    <!-- Search, and results   -->
    <div class="flex-none">
      <div class="flex flex-col">
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

        <div class="flex gap-1">
          <va-button class="flex-none">Add Selected</va-button>
          <span
            >Showing {{ searchResults.length }} of {{ totalResults }} filtered
            results</span
          >
        </div>

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
                    class="flex-initial"
                    icon="add"
                    size="small"
                    preset="primary"
                    :disabled="resultsToAssign.includes(rowData)"
                    @click="
                      () => {
                        if (!resultsToAssign.includes(rowData)) {
                          resultsToAssign.push(rowData);
                          emit('select', rowData);
                        }
                      }
                    "
                  >
                  </va-button>
                  <va-button
                    class="flex-initial"
                    icon="delete"
                    size="small"
                    preset="primary"
                    color="danger"
                    :disabled="!resultsToAssign.includes(rowData)"
                    @click="
                      () => {
                        deleteResult(rowData);
                        emit('remove', rowData);
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
      <div class="va-h6">{{ props.selectedTitle }}</div>

      <va-data-table :items="resultsToAssign" :columns="_selectedResultColumns">
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

const props = defineProps({
  placeholder: {
    type: String,
    default: () => "Type to search",
  },
  query: {
    type: Object,
  },
  selectedTitle: {
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
});

const emit = defineEmits(["select", "remove"]);

const fieldValue = (rowData, columnsConfig) => {
  return columnsConfig["formatFn"]
    ? columnsConfig["formatFn"](rowData[columnsConfig["key"]])
    : rowData[columnsConfig["key"]];
};

const infiniteScrollTarget = ref(null);

const page = ref(1);
const skip = computed(() => {
  return props.pageSize * (page.value - 1);
});

const searchTerm = ref("");
const searchResults = ref([]);
const totalResults = ref(0);
const selectedSearchResults = ref([]);
let resultsToAssign = ref([]);

const deleteResult = (row) => {
  const targetIdentity =
    typeof props.trackBy === "function"
      ? props.trackBy(row)
      : _.get(row, props.trackBy);
  const targetIndex = resultsToAssign.value.findIndex((e) => {
    const sourceIdentity =
      typeof props.trackBy === "function"
        ? props.trackBy(e)
        : _.get(e, props.trackBy);
    return sourceIdentity === targetIdentity;
  });

  resultsToAssign.value.splice(
    // find the target element (the one to be deleted) among the results
    targetIndex,
    1,
  );
};

const getTemplate = (field) => `cell(${field["key"]})`;

const _searchResultColumns = computed(() => {
  return props.searchResultColumns
    .concat({
      key: "actions",
      label: "Actions",
    })
    .map((e) => ({ ...e, template: getTemplate(e) }));
});

const _selectedResultColumns = computed(() => {
  return props.selectedResultColumns.map((e) => ({
    ...e,
    template: getTemplate(e),
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
