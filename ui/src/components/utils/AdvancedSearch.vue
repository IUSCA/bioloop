<template>
  <div class="flex search">
    <!-- Search, and results   -->
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
        <div class="flex flex-none flex-col gap-0.5">
          <va-checkbox label="Raw Data" v-model="filterRawData" />
          <va-checkbox label="Data Product" v-model="filterDataProducts" />
        </div>
      </div>

      <div class="flex gap-1">
        <va-button class="flex-none">Add Selected</va-button>
        <span>Showing X of Y elements</span>
      </div>

      <va-data-table :items="searchResults" :columns="searchColumns">
        <template #cell(select)="{ value }">
          <va-checkbox />
        </template>
        <!--        rowData[fieldConfig["field"]]-->
        <template
          v-for="(templateName, i) in searchResultColumnTemplateNames"
          #[templateName]="{ rowData }"
        >
          {{ rowData[props.searchResultColumns[i]["key"]] }}
        </template>
      </va-data-table>
    </div>

    <va-divider vertical class="flex-none"></va-divider>

    <!-- Selected results -->
    <div>
      <div class="va-h6">{{ props.selectedTitle }}</div>
      <va-data-table
        :items="selectedResults"
        :columns="props.selectedResultColumns"
      >
        <template #select(row)>
          <va-checkbox v-model="row.selected" />
        </template>
      </va-data-table>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  placeholder: {
    type: String,
    default: () => "Type to search",
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
});

debugger;

const filterRawData = ref(false);
const filterDataProducts = ref(false);
const searchTerm = ref("");
const searchResults = ref([
  {
    name: "d1",
    type: "Raw",
    size: 0,
    // created_on: "2020-01-01T00:00:0",
  },
]);
const selectedResults = ref([]);

const actionColumns = [
  {
    key: "select",
    label: "Select",
  },
  {
    key: "Action",
    label: "Actions",
  },
];

const searchColumns = computed(() => {
  return [actionColumns[0], ...props.searchResultColumns, actionColumns[1]];
});

// const searchResultColumnsConfig = computed(() => {
//   return props.searchResultColumns.map(e => ({...e, tableKey:}))
// })

const searchResultColumnTemplateNames = computed(() => {
  return props.searchResultColumns.map((e) => `cell(${e.key})`);
});
</script>

<style scoped lang="scss">
.search {
  border: 1px solid red;

  .icon {
    color: var(--va-secondary);
  }
}
</style>
