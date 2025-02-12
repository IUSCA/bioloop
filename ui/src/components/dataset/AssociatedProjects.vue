<template>
  <!-- Associated Projects -->
  <div>
    <va-card>
      <va-card-title @click="toggleCard" class="cursor-pointer">
        <div class="flex flex-nowrap items-center w-full">
          <span class="flex-auto text-lg"> Associated Projects </span>
          <Icon
            :icon="
              collapsed
                ? 'material-symbols:expand-more'
                : 'material-symbols:expand-less'
            "
            class="text-xl"
          />
        </div>
      </va-card-title>
      <va-card-content v-if="!collapsed">
        <!--Inserting the new code here-->
        <!-- search bar and create button -->
        <div class="flex items-center gap-3 mb-3">
          <!-- search bar -->
          <div class="flex-1">
            <va-input
              v-model="params.search"
              @update:model-value="debouncedUpdate"
              class="w-full"
              placeholder="Search Projects"
              outline
              clearable
            >
              <template #prependInner>
                <Icon icon="material-symbols:search" class="text-xl" />
              </template>
            </va-input>
          </div>
          <!-- reset button -->
          <div class="flex-none" v-if="isResetVisible">
            <va-button
              icon="restart_alt"
              @click="resetSortParams"
              preset="primary"
            >
              Reset Sort
            </va-button>
          </div>
        </div>

        <!-- projects table -->
        <div>
          <va-data-table
            :items="row_items"
            :columns="columns"
            v-model:sort-by="params.sortBy"
            v-model:sorting-order="params.sortingOrder"
            disable-client-side-sorting
            hoverable
            :loading="data_loading"
          >
            <template #cell(name)="{ rowData }">
              <router-link :to="`/projects/${rowData.slug}`" class="va-link">
                {{ rowData.name || "No Data" }}
              </router-link>
            </template>

            <template #cell(datasets)="{ source }">
              {{ (source || []).length || "No Data" }}
            </template>

            <template #cell(users)="{ source }">
              <div class="flex gap-1">
                <va-chip
                  v-for="(user, i) in source.slice(0, 3)"
                  :key="i"
                  size="small"
                  class="flex-none"
                >
                  {{ user?.username || "No Data" }}
                </va-chip>
                <va-chip
                  v-if="source.length > 3"
                  size="small"
                  class="flex-none"
                >
                  +{{ source.length - 3 }}
                </va-chip>
              </div>
            </template>

            <template #cell(created_at)="{ value }">
              <span>{{ datetime.date(value) || "No Data" }}</span>
            </template>

            <template #cell(updated_at)="{ value }">
              <span>{{ datetime.date(value) || "No Data" }}</span>
            </template>

            <template #cell(assigned_at)="{ value }">
              <span>{{ datetime.date(value) || "No Data" }}</span>
            </template>

            <template #cell(assignor)="{ rowData }">
              <span>{{ rowData.assignor?.username || "No Data" }}</span>
            </template>
          </va-data-table>
        </div>

        <!-- pagination Code -->
        <Pagination
          class="mt-4 px-1 lg:px-3"
          v-model:page="params.currentPage"
          v-model:page_size="params.itemsPerPage"
          :total_results="totalItems"
          :curr_items="row_items.length"
          :page_size_options="PAGE_SIZE_OPTIONS"
        />
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { useDebounceFn } from "@vueuse/core";
const collapsed = ref(true);
const props = defineProps({ datasetId: String, appendFileBrowserUrl: Boolean });
const projects = ref([]);
const data_loading = ref(false);
const totalItems = ref(0);
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const debouncedUpdate = useDebounceFn((val) => {
  params.value.search = val;
}, 300);

// Method to toggle the collapse state
function toggleCard() {
  collapsed.value = !collapsed.value; // Toggle the collapse state
}

function defaultParams() {
  return {
    search: "",
    sortBy: "updated_at",
    sortingOrder: "desc",
    currentPage: 1,
    itemsPerPage: 25,
  };
}

const params = ref(defaultParams());

useQueryPersistence({
  refObject: params,
  defaultValueFn: defaultParams,
  key: "q",
  history_push: true,
});

const isResetVisible = computed(() => {
  const defaultParamsObj = defaultParams();
  return (
    params.value.sortBy !== defaultParamsObj.sortBy ||
    params.value.sortingOrder !== defaultParamsObj.sortingOrder
  );
});

function resetSortParams() {
  // Reset params to their default values
  params.value.sortBy = defaultParams().sortBy;
  params.value.sortingOrder = defaultParams().sortingOrder;
}

const row_items = computed(() => {
  return projects.value.map((project) => {
    // eslint-disable-next-line no-unused-vars
    const { users, contacts, datasets, ...rest } = project;
    const _users = (users || []).map((obj) => ({
      id: obj?.user?.id,
      username: obj?.user?.username,
    }));
    // const contact_values = (contacts || []).map(
    //   (contact) => contact?.contact?.value
    // );
    const _datasets = (datasets || []).map((d) => ({
      id: d?.dataset?.id,
      name: d?.dataset?.name,
    }));
    return {
      ...rest,
      users: _users,
      // contacts: contact_values,
      datasets: _datasets,
    };
  });
});

// This could've been split into two variables user_columns and admin_columns
// and concataned based on user roles
// but the order of columns would not be preserved

const columns = [
  { key: "name", sortable: true },
  { key: "users", sortable: false, width: "30%" },
  {
    key: "datasets",
    sortable: false,
    width: "80px",
    thAlign: "center",
    tdAlign: "center",
  },
  { key: "created_at", label: "Created At", sortable: true, width: "100px" },
  { key: "updated_at", label: "Updated At", sortable: true, width: "150px" },
  { key: "assigned_at", label: "Assigned At", sortable: true, width: "150px" },
  { key: "assigner", label: "Assigner", sortable: false, width: "150px" },
];

function fetch_projects() {
  data_loading.value = true;

  const skip = (params.value.currentPage - 1) * params.value.itemsPerPage;

  const queryparams = {
    search: params.value.search,
    take: params.value.itemsPerPage,
    skip: skip,
    sortBy: params.value.sortBy,
    sort_order: params.value.sortingOrder,
  };

  const IntdatasetID = parseInt(props.datasetId, 10);

  DatasetService.getProjects({ id: IntdatasetID, params: queryparams })
    .then((res) => {
      console.log(res.data.projects);
      projects.value = res.data.projects.map((project) => {
        const matchingDataset = project.datasets.find(
          (d) => d.dataset.id === IntdatasetID,
        );
        const assigned_at = matchingDataset
          ? matchingDataset.assigned_at
          : null;
        const assigner =
          matchingDataset && matchingDataset.assignor
            ? matchingDataset.assignor.name
            : "No Data";

        return {
          ...project,
          assigned_at,
          assigner,
        };
      });
      totalItems.value = res.data.metadata.count;
    })
    .catch((error) => {
      console.error(
        "Error fetching projects:",
        error.response || error.message,
      );
      toast.error("Error fetching projects");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

fetch_projects();

watch(
  () => params.value.currentPage,
  () => {
    fetch_projects();
  },
);

watch(
  [
    () => params.value.itemsPerPage,
    () => params.value.search,
    () => params.value.sortBy,
    () => params.value.sortingOrder,
  ],
  () => {
    if (params.value.currentPage === 1) {
      fetch_projects();
    }
    params.value.currentPage = 1;
  },
);
</script>
