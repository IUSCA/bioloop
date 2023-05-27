<template>
  <div>
    <!-- search bar and filter -->
    <div class="flex mb-3 gap-3">
      <!-- search bar -->
      <div class="flex-1">
        <va-input
          v-model="filterInput"
          class="border-gray-800 border border-solid w-full"
          :placeholder="`search ${props.label.toLowerCase()}`"
          outline
          clearable
        />
      </div>

      <!-- filter -->
      <div class="flex-none flex items-center justify-center">
        <filters-group @update="fetch_all"></filters-group>
      </div>
    </div>

    <!-- table -->
    <va-data-table
      :items="datasets"
      :columns="columns"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortingOrder"
      :loading="data_loading"
      :filter="filterInput"
    >
      <template #cell(name)="{ rowData }">
        <router-link :to="`/datasets/${rowData.id}`" class="va-link">{{
          rowData.name
        }}</router-link>
      </template>

      <template #cell(created_at)="{ value }">
        <span>{{ moment(value).utc().format("MMM D YYYY") }}</span>
      </template>

      <template #cell(archived)="{ source }">
        <span v-if="source" class="flex justify-center">
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(staged)="{ rowData }">
        <span
          v-if="DatasetService.is_staged(rowData?.states)"
          class="flex justify-center"
        >
          <i-mdi-check-circle-outline class="text-green-700" />
        </span>
      </template>

      <template #cell(num_genome_files)="{ rowData }">
        <maybe :data="rowData?.metadata?.num_genome_files" />
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
          Archive). Additionally, it will stage the contents to
          <span class="path bg-slate-200">
            {{ config.paths.stage[props.dtype] }}/{{
              launch_modal.selected?.name
            }}
          </span>
          and generate QC (Quality Control) files and report.
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
  </div>
</template>

<script setup>
import moment from "moment";
import DatasetService from "@/services/dataset";
import { formatBytes } from "@/services/utils";
import toast from "@/services/toast";
import config from "@/config";

const props = defineProps({
  dtype: String,
  label: String,
});

const datasets = ref([]);
const filterInput = ref("");
const data_loading = ref(false);
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
    label: "registered on",
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
    key: "states",
    name: "staged",
    label: "staged",
    thAlign: "center",
    tdAlign: "center",
    sortable: true,
    width: 40,
    sortingFn: (a, b) =>
      DatasetService.is_staged(a) - DatasetService.is_staged(b),
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

// initial sorting order
const sortBy = ref("updated_at");
const sortingOrder = ref("desc");

// function getRowBind(row) {
//   // const active_wf = row.workflows?.filter(
//   //   (workflow) => !workflowService.is_workflow_done(workflow)
//   // );
//   // const is_in_progress = (active_wf?.length || 0) > 0;
//   // if (is_in_progress) {
//   //   return { class: ["bg-slate-200"] };
//   // }
//   // highlight deleted datasets
//   if (row.is_deleted) {
//     return { class: ["bg-slate-200"] };
//   }
// }

function fetch_all(query = {}) {
  data_loading.value = true;
  return DatasetService.getAll({ type: props.dtype, ...query })
    .then((res) => {
      datasets.value = res.data;
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch data");
    })
    .finally(() => {
      data_loading.value = false;
    });
}
fetch_all();

function launch_wf(id) {
  data_loading.value = true;
  DatasetService.archive_dataset(id)
    .then(() => {
      toast.success(`Launched a workflow to archive the dataset: ${id}`);
      fetch_all();
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to archive the dataset");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

function delete_dataset(id) {
  data_loading.value = true;
  DatasetService.delete_dataset({ id, soft_delete: false })
    .then(() => {
      toast.success(`Deleted dataset: ${id}`);
      fetch_all();
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to delete dataset");
    })
    .finally(() => {
      data_loading.value = false;
    });
}
</script>
