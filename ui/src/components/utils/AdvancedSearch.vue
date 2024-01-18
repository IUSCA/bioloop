<template>
  <div class="flex search">
    <!-- Search, and results   -->
    <div class="flex-none w-9/12">
      <div class="flex flex-col">
        <div class="flex gap-1.5">
          <va-input
            v-model="searchTerm"
            :placeholder="props.placeholder || 'Search'"
          >
            <template #prependInner>
              <va-icon name="search" class="icon"></va-icon>
            </template>
            <template #appendInner>
              <va-icon name="highlight_off" class="icon"></va-icon>
            </template>
          </va-input>
          <div class="flex-none">
            <div class="flex flex-col gap-0.5">
              <slot></slot>
            </div>
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
            class="search_scroll"
            :load="loadMore"
            :scroll-target="infiniteScrollTarget"
            :disabled="
              searchResults.length === totalResults ||
              searchResults.length < props.pageSize
            "
          >
            <va-data-table
              v-model="selectedResults"
              class="search_table"
              :items="searchResults"
              :columns="searchColumns"
              selectable
              select-mode="multiple"
            >
              <template
                v-for="(templateName, i) in searchResultColumnTemplateNames"
                #[templateName]="{ rowData }"
              >
                {{
                  columnConfig(i)["formatFn"]
                    ? columnConfig(i)["formatFn"](
                        rowData[columnConfig(i)["key"]],
                      )
                    : rowData[columnConfig(i)["key"]]
                }}
              </template>
            </va-data-table>
          </va-infinite-scroll>
        </div>
      </div>
    </div>

    <div class="flex-none">
      <va-divider vertical></va-divider>
    </div>

    <!-- Selected results -->
    <div class="w-3/12 flex-none">
      <div class="va-h6">{{ props.selectedTitle }}</div>
      <va-data-table
        :items="resultsToAssign"
        :columns="props.selectedResultColumns"
      >
        <!--        <template #select(row)>-->
        <!--          <va-checkbox v-model="row.selected" />-->
        <!--        </template>-->
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
    type: Function,
    default: (e) => e.id,
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

const columnConfig = (i) => props.searchResultColumns[i];

const infiniteScrollTarget = ref(null);

const page = ref(1);
const skip = computed(() => {
  return props.pageSize * (page.value - 1);
});

const searchTerm = ref("");
const searchResults = ref([]);
const totalResults = ref(0);
const selectedResults = ref([]);
const resultsToAssign = ref([
  {
    name: "d1",
    type: "Raw",
    size: 0,
    // created_on: "2020-01-01T00:00:0",
  },
  {
    name: "d2",
    type: "Raw",
    size: 0,
    // created_on: "2020-01-01T00:00:0",
  },
]);

const actionColumns = [
  {
    key: "Action",
    label: "actions",
  },
];

const searchColumns = computed(() => {
  return props.searchResultColumns.concat(actionColumns);
});

const searchResultColumnTemplateNames = computed(() => {
  return props.searchResultColumns.map((e) => `cell(${e.key})`);
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
  // const query =
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
  // debugger;
  page.value += 1;
  return loadResults();
};

watch([searchTerm, _query], () => {
  // if (!_.isEqual(value, oldValue)) {
  // reset search results
  searchResults.value = [];
  // reset page value
  page.value = 1;
  loadResults();
  // }
});

onMounted(() => {
  loadResults();
});
</script>

<style scoped lang="scss">
.search {
  border: 1px solid red;

  .icon {
    color: var(--va-secondary);
  }
}

.search_scroll {
  border: 1px solid yellow;
}

.search_table {
  border: 1px solid blue;
}
</style>
