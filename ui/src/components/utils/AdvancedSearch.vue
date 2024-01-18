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
              v-model="selectedSearchResults"
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

              <template #cell(actions)="{ rowData }">
                <va-button
                  class="flex-none"
                  @click="
                    () => {
                      resultsToAssign.push(rowData);
                      emit('select', rowData);
                    }
                  "
                >
                  Add
                </va-button>
                <va-button
                  class="flex-none"
                  @click="
                    () => {
                      deleteResult(rowData);
                      emit('remove', rowData);
                    }
                  "
                >
                  Delete
                </va-button>
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

const columnConfig = (i) => props.searchResultColumns[i];

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

const searchColumns = computed(() => {
  return props.searchResultColumns.concat({
    key: "actions",
    label: "Actions",
  });
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
