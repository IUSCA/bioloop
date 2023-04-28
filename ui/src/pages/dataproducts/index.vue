<template>
  <h2 class="text-4xl font-bold">Data Products</h2>

  <div>
    <div class="flex my-2 gap-3">
      <div class="flex-1">
        <va-input
          v-model="filterInput"
          class="border-gray-800 border border-solid w-full"
          placeholder="search data products"
          outline
          clearable
        />
      </div>
      <!-- <div class="flex-1">search bar</div> -->

      <div class="flex-[0_0_10rem] flex items-center justify-center">
        <filters-group @update="fetch_all"></filters-group>
      </div>
    </div>

    <va-data-table
      :items="dataproducts"
      :columns="columns"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortingOrder"
      :loading="data_loading"
      :filter="filterInput"
      :row-bind="getRowBind"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/datasets/${rowData.id}`" class="va-link">{{
          rowData.name
        }}</router-link>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
      </template>

      <template #cell(archived)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(staged)="{ rowData }">
        <span
          v-if="BatchService.is_staged(rowData)"
          class="flex justify-center"
        >
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(updated_at)="{ value }">
        <span>{{ moment(value).fromNow() }}</span>
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
          <va-popover
            message="Delete entry"
            placement="left"
            v-if="(rowData?.workflows?.length || 0) == 0 && !rowData.is_deleted"
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
    <va-modal
      :title="`Archive ${launch_modal.selected?.name}`"
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
          archive the data product to the SDA (Secure Data Archive).
          Additionally, it will stage the contents to
          <span class="path bg-slate-200">
            {{ config.paths.stage.data_products }}/{{
              launch_modal.selected?.name
            }} </span
          >.
        </p>
        <p>
          Please be aware that the time it takes to complete this process
          depends on the size of the directory and the amount of data being
          archived. To monitor the progress of the workflow, you can view the
          data product details page.
        </p>
      </div>
    </va-modal>

    <va-modal
      :title="`Delete ${delete_modal.selected?.name}?`"
      :model-value="delete_modal.visible"
      size="small"
      okText="Delete"
      @ok="
        delete_modal.visible = false;
        delete_data_product(delete_modal.selected?.id);
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
  </div>
</template>

<script setup>
import moment from "moment";
import BatchService from "@/services/batch";
import { formatBytes } from "@/services/utils";
import toast from "@/services/toast";
import config from "@/config";

// const batches = ref([]);
const dataproducts = ref([]);
const data_loading = ref(false);
const filterInput = ref("");
const launch_modal = ref({
  visible: false,
  selected: null,
});
const delete_modal = ref({
  visible: false,
  selected: null,
});

const columns = ref([
  // { key: "id", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "name", sortable: true, sortingOptions: ["desc", "asc", null] },
  {
    key: "created_at",
    label: "start date",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  {
    key: "archive_path",
    name: "archived",
    label: "archived",
    thAlign: "center",
    tdAlign: "center",
    sortable: true,
  },
  {
    key: "stage_path",
    name: "staged",
    label: "staged",
    thAlign: "center",
    tdAlign: "center",
    sortable: true,
  },
  {
    key: "updated_at",
    label: "last updated",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  // { key: "status", sortable: false },
  {
    key: "num_genome_files",
    label: "data files",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
  },
  {
    key: "du_size",
    label: "size",
    sortable: true,
    sortingOptions: ["desc", "asc", null],
    width: 80,
    sortingFn: (a, b) => a - b,
  },
  {
    key: "workflows",
    thAlign: "center",
    tdAlign: "center",
  },
  { key: "actions", width: 80 },
]);

function getRowBind(row) {
  // const active_wf = row.workflows?.filter(
  //   (workflow) => !workflowService.is_workflow_done(workflow)
  // );
  // const is_in_progress = (active_wf?.length || 0) > 0;
  // if (is_in_progress) {
  //   return { class: ["bg-slate-200"] };
  // }
  // highlight deleted batches
  if (row.is_deleted) {
    return { class: ["bg-slate-200"] };
  }
}

// initial sorting order
const sortBy = ref("updated_at");
const sortingOrder = ref("desc");

function fetch_all() {
  data_loading.value = true;
  BatchService.getAll({ type: "DATA_PRODUCT" })
    .then((res) => {
      dataproducts.value = res.data;
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch data products");
    })
    .finally(() => {
      data_loading.value = false;
    });
}
fetch_all();

function launch_wf(id) {
  console.log("launch wf", id);
}

function delete_data_product(id) {
  console.log("delete wf", id);
  BatchService.delete_batch({ id, soft_delete: false });
}
</script>

<route lang="yaml">
meta:
  title: Data Products
</route>
