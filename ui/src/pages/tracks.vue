<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1" v-if="activeFilters.length === 0">
        <va-input
          :model-value="params.inclusive_query"
          class="w-full"
          :placeholder="`Search ${props.label.toLowerCase()}`"
          outline
          clearable
          @update:model-value="handleMainFilter"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- Filter button -->
      <va-button @click="searchModal.show()" preset="primary" class="flex-none">
        <i-mdi-filter />
        <span> Filters </span>
      </va-button>

      <!-- active filter chips -->
      <DatasetSearchFilters
        v-if="activeFilters.length > 0"
        class="flex-none"
        @search="handleSearch"
        @open="searchModal.show()"
      />
    </div>

    <!-- table -->
    <va-data-table
      :items="datasets"
      :columns="columns"
      v-model:sort-by="query.sort_by"
      v-model:sorting-order="query.sort_order"
      disable-client-side-sorting
      :loading="data_loading"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/datasets/${rowData.id}`" class="va-link">{{
            rowData.name
          }}</router-link>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ datetime.date(value) }}</span>
      </template>

      <template #cell(archived)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(staged)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <!-- <template #cell(num_genome_files)="{ rowData }">
        <Maybe :data="rowData?.metadata?.num_genome_files" />
      </template> -->

      <template #cell(source_datasets)="{ source }">
        <Maybe :data="source?.length" :default="0" />
      </template>

      <template #cell(derived_datasets)="{ source }">
        <Maybe :data="source?.length" :default="0" />
      </template>

      <template #cell(updated_at)="{ value }">
        <span>{{ datetime.fromNow(value) }}</span>
      </template>

      <template #cell(du_size)="{ source }">
        <span>{{ source != null ? formatBytes(source) : "" }}</span>
      </template>

      <template #cell(workflows)="{ source }">
        <span>{{ source?.length || 0 }}</span>
      </template>

      <template #cell(actions)="{ rowData }">
        <div class="flex gap-2">
          <va-popover
            message="Archive"
            placement="left"
            v-if="(rowData?.workflows?.length || 0) == 0 && !rowData.is_deleted"
          >
            <va-button
              class="flex-initial"
              size="small"
              preset="primary"
              @click="
                launch_modal.visible = true;
                launch_modal.selected = rowData;
              "
            >
              <i-mdi-rocket-launch />
            </va-button>
          </va-popover>

          <!-- Delete button -->
          <!-- Only show when the dataset has no workflows, is not archived, and has no workflows -->
          <va-popover
            message="Delete entry"
            placement="left"
            v-if="
              (rowData?.workflows?.length || 0) == 0 &&
              !rowData.is_deleted &&
              !rowData.is_archived
            "
          >
            <va-button
              size="small"
              preset="primary"
              color="danger"
              class="flex-initial"
              @click="
                delete_modal.visible = true;
                delete_modal.selected = rowData;
              "
            >
              <i-mdi-delete />
            </va-button>
          </va-popover>
        </div>
      </template>
    </va-data-table>

    <!-- pagination -->
    <Pagination
      class="mt-4 px-1 lg:px-3"
      v-model:page="query.page"
      v-model:page_size="query.page_size"
      :total_results="total_results"
      :curr_items="datasets.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />

    <!-- launch modal -->
    <va-modal
      :title="`Archive ${props.label} ${launch_modal.selected?.name}`"
      :model-value="launch_modal.visible"
      size="small"
      okText="Archive"
      @ok="
        launch_modal.visible = false;
        launch_wf(launch_modal.selected?.id);
        launch_modal.selected = null;
      "
      @cancel="
        launch_modal.visible = false;
        launch_modal.selected = null;
      "
    >
      <div class="flex flex-col gap-3">
        <p>
          By clicking the "Archive" button, a workflow will be initiated to
          archive the {{ props.label.toLowerCase() }} to the SDA (Secure Data
          Archive).
        </p>
        <p>
          Please be aware that the time it takes to complete this process
          depends on the size of the directory and the amount of data being
          archived. To monitor the progress of the workflow, you can view the
          dataset's details page.
        </p>
      </div>
    </va-modal>

    <!-- delete modal -->
    <va-modal
      :title="`Delete ${delete_modal.selected?.name}?`"
      :model-value="delete_modal.visible"
      size="small"
      okText="Delete"
      @ok="
        delete_modal.visible = false;
        delete_dataset(delete_modal.selected?.id);
        delete_modal.selected = null;
      "
      @cancel="
        delete_modal.visible = false;
        delete_modal.selected = null;
      "
    >
      <div class="flex flex-col gap-3">
        <p>
          Please note that this action will delete the database entry and will
          not delete any associated files.
        </p>
      </div>
    </va-modal>

    <DatasetSearchModal ref="searchModal" @search="handleSearch" />
  </div>
</template>

<script setup>
import {formatBytes} from "@/services/utils";
import * as datetime from "@/services/datetime";
import {useTracksStore} from "@/stores/tracks";
import {storeToRefs} from "pinia";
import useQueryPersistence from "@/composables/useQueryPersistence";

const { filters, query, params, activeFilters } = storeToRefs(store);

const store = useTracksStore();

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const tracks = []

const total_results = ref(0);
// used for OFFSET clause in the SQL used to retrieve the next paginated batch
// of results
const offset = computed(() => (query.value.page - 1) * query.value.page_size);

useQueryPersistence({
  refObject: params,
  defaultValueFn: store.defaultParams,
  key: "q",
  history_push: true,
});

const columns = [
  {
    key: "name",
    sortable: true,
  },
  // ...(isFeatureEnabled({
  //   featureKey: "genomeBrowser",
  //   hasRole: auth.hasRole,
  // })
  //   ? [
  //     {
  //       key: "num_genome_files",
  //       label: "data files",
  //       width: "80px",
  //     },
  //   ]
  //   : []),

  // { key: "actions", width: "100px" },
];

</script>


<style scoped>

</style>

<route lang="yaml">
meta:
  title: Tracks
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Tracks" }]
</route>
