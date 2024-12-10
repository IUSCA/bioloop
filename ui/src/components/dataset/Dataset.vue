<template>
  <va-inner-loading :loading="loading">
    <!-- Content -->
    <div class="flex flex-col gap-3">
      <!-- Dataset Info + Status Cards -->
      <div class="grid gird-cols-1 lg:grid-cols-2 gap-3">
        <!-- Dataset Info -->
        <div class="">
          <va-card>
            <va-card-title>
              <!-- <span class="text-xl">Info</span> -->
              <div class="flex flex-nowrap items-center w-full">
                <span class="flex-auto text-lg"> Info </span>
                <AddEditButton
                  class="flex-none"
                  edit
                  @click="openModalToEditDataset"
                />
              </div>
            </va-card-title>
            <va-card-content>
              <DatasetInfo :dataset="dataset"></DatasetInfo>
              <div class="flex justify-end mt-3 pr-3 gap-3">
                <!-- file browser -->
                <va-button
                  :disabled="!dataset.num_files"
                  preset="primary"
                  @click="navigateToFileBrowser"
                  class="flex-none"
                  :color="isDark ? '#9171f8' : '#A020F0'"
                >
                  <i-mdi-folder-open class="pr-2 text-xl" /> Browse Files
                </va-button>

                <!-- edit description -->
                <!-- <va-button
                  preset="primary"
                  @click="openModalToEditDataset"
                  class="flex-none"
                >
                  <i-mdi-pencil-outline class="pr-2 text-xl" /> Edit Description
                </va-button> -->
              </div>
            </va-card-content>
          </va-card>
        </div>

        <!-- Status Cards -->
        <div
          class="flex flex-col gap-3 justify-start"
          v-if="!dataset.is_deleted"
        >
          <!-- Archived -->
          <div class="flex-none" v-if="dataset.archive_path">
            <va-card>
              <va-card-title>
                <span class="text-lg">Archived</span>
              </va-card-title>
              <va-card-content>
                <div>
                  <CopyText :text="dataset.archive_path" />
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- Staged for processing -->
          <div class="flex-none" v-if="dataset.is_staged">
            <va-card>
              <va-card-title>
                <span class="text-lg">Staged for Processing</span>
              </va-card-title>
              <va-card-content>
                <div class="">
                  <CopyText :text="dataset.staged_path" />
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- Reports -->
          <div class="flex-none" v-if="dataset?.metadata?.report_id">
            <va-card>
              <va-card-title>
                <span class="text-lg">Reports</span>
              </va-card-title>
              <va-card-content>
                <div class="flex flex-nowrap gap-3 justify-start items-center">
                  <i-mdi-chart-box-outline class="flex-initial text-2xl" />
                  <a
                    class="va-link flex items-center justify-start"
                    target="_blank"
                    :href="`/api/reports/${dataset?.metadata?.report_id}/multiqc_report.html`"
                  >
                    <span class="flex-initial">MultiQC Report</span>
                    <i-mdi-open-in-new class="flex-initial inline-block pl-1" />
                  </a>
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- Actions -->
          <div class="flex-none" v-if="dataset.archive_path">
            <va-card>
              <va-card-title>
                <span class="text-lg">Actions</span>
              </va-card-title>
              <va-card-content>
                <div class="flex justify-start gap-3">
                  <!-- Stage Action Button-->
                  <va-button
                    v-if="dataset.archive_path"
                    :disabled="is_stage_pending || dataset.is_staged"
                    color="primary"
                    border-color="primary"
                    preset="secondary"
                    class="flex-initial"
                    @click="stage_modal = true"
                  >
                    <i-mdi-cloud-sync class="pr-2 text-2xl" />
                    Stage Files
                  </va-button>

                  <!-- Delete Action Button-->
                  <va-button
                    v-if="config.enable_delete_archive && dataset.archive_path"
                    :disabled="is_delete_pending"
                    color="danger"
                    border-color="danger"
                    class="flex-initial"
                    preset="secondary"
                    @click="delete_archive_modal.visible = true"
                  >
                    <i-mdi-delete class="pr-2 text-2xl" />
                    Delete Archive
                  </va-button>

                  <va-button
                    :disabled="
                      !dataset.is_staged || !config.enabledFeatures.downloads
                    "
                    class="flex-initial"
                    color="primary"
                    border-color="primary"
                    preset="secondary"
                    @click="openModalToDownloadDataset"
                  >
                    <i-mdi-download class="pr-2 text-2xl" /> Download
                  </va-button>
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- stage modal -->
          <va-modal
            :model-value="stage_modal"
            message="Stage all files in this dataset from the SDA?"
            size="small"
            @ok="stage_dataset"
            @cancel="stage_modal = !stage_modal"
          />

          <!-- delete archive modal -->
          <va-modal
            :model-value="delete_archive_modal.visible"
            blur
            hide-default-actions
          >
            <template #header>
              <div class="flex justify-end">
                <va-button
                  class="flex-initial"
                  preset="plain"
                  @click="delete_archive_modal.visible = false"
                >
                  <i-mdi-close />
                </va-button>
              </div>
            </template>

            <div>
              <p class="text-lg font-bold">Delete Archive?</p>

              <va-divider class="my-2" />

              <div class="flex flex-col items-center gap-2">
                <div><i-mdi-zip-box-outline class="text-3xl" /></div>
                <span class="text-xl tracking-wide">
                  {{ config.dataset.types[dataset.type]?.label }} /
                  {{ dataset.name }}
                </span>
                <div class="flex items-center gap-5">
                  <div class="flex items-center gap-1">
                    <i-mdi-harddisk class="text-xl" />
                    <span> {{ formatBytes(dataset.du_size) }} </span>
                  </div>
                  <div
                    class="flex items-center gap-1"
                    v-if="config.enabledFeatures.genomeBrowser"
                  >
                    <i-mdi-file-multiple class="text-xl" />
                    <span> {{ dataset.metadata?.num_genome_files }} </span>
                  </div>
                </div>
              </div>

              <va-divider class="my-4" />

              <div>
                <va-alert
                  color="#fdeae7"
                  text-color="#940909"
                  class="text-center"
                >
                  <span>
                    Unexpected bad things will happen if you don't read this!
                  </span>
                </va-alert>

                <ul class="va-unordered va-text-secondary mt-3">
                  <li>
                    This will permanently delete the
                    <b> {{ dataset.name }} </b> archive on the SDA at
                    <span class="path bg-slate-200 dark:bg-slate-800">
                      {{ dataset.archive_path }}
                    </span>
                    , its associated workflows and task runs.
                  </li>
                  <li>This will not delete any of the staged files.</li>
                </ul>
              </div>

              <va-divider class="my-4" />

              <div class="flex flex-col">
                <p>To confirm, type "{{ dataset.name }}" in the box below</p>
                <va-input
                  v-model="delete_archive_modal.input"
                  class="my-2 w-full"
                />
                <va-button
                  color="danger"
                  :disabled="delete_archive_modal.input !== dataset.name"
                  @click="delete_archive"
                >
                  Delete this dataset
                </va-button>
              </div>
            </div>
          </va-modal>
        </div>
      </div>

      <!-- Associated datasets -->
      <assoc-datasets
        :source_datasets_meta="dataset?.source_datasets"
        :derived_datasets_meta="dataset?.derived_datasets"
      />

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
            <!--Projects Data starts from here-->

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
                  <router-link
                    :to="`/projects/${rowData.slug}`"
                    class="va-link"
                  >
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

      <!-- Audit logs -->
      <div v-if="dataset?.audit_logs?.length">
        <va-card>
          <va-card-title class="">
            <div class="flex flex-nowrap items-center w-full">
              <span class="text-lg"> Audit Logs </span>
            </div>
          </va-card-title>
          <va-card-content>
            <AuditLogs :logs="dataset.audit_logs" />
          </va-card-content>
        </va-card>
      </div>

      <!-- Workflows -->
      <div>
        <span class="flex text-xl my-2 font-bold">WORKFLOWS</span>
        <!-- TODO: add filter based on workflow status -->
        <!-- TODO: remove delete workflow feature. Instead have delete archive feature -->
        <div v-if="(dataset.workflows || []).length > 0" class="space-y-2">
          <collapsible
            v-for="workflow in dataset.workflows"
            :key="workflow.id"
            v-model="workflow.collapse_model"
          >
            <template #header-content>
              <WorkflowCompact :workflow="workflow" />
            </template>

            <div>
              <workflow
                :workflow="workflow"
                @update="fetch_dataset(true)"
              ></workflow>
            </div>
          </collapsible>
        </div>
        <div
          v-else
          class="text-center bg-slate-200 dark:bg-slate-800 py-2 rounded shadow"
        >
          <i-mdi-card-remove-outline class="inline-block text-4xl pr-3" />
          <span class="text-lg">
            There are no workflows associated with this datatset.
          </span>
        </div>
      </div>
    </div>
    <!-- Download Modal -->
    <DatasetDownloadModal ref="downloadModal" :dataset="dataset" />
  </va-inner-loading>

  <EditDatasetModal
    :key="dataset"
    :data="dataset"
    ref="editModal"
    @update="fetch_dataset(true)"
  />
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import config from "@/config";
import DatasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import workflowService from "@/services/workflow";
import { useDebounceFn } from "@vueuse/core";
const router = useRouter();
const route = useRoute();
const isDark = useDark();
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

const dataset = ref({});
const loading = ref(false);
const stage_modal = ref(false);
const delete_archive_modal = ref({
  visible: false,
  input: "",
});

const active_wf = computed(() => {
  return (dataset.value?.workflows || [])
    .map(workflowService.is_workflow_done)
    .some((x) => !x);
});

const is_stage_pending = computed(() => {
  return workflowService.is_step_pending("stage", dataset.value?.workflows);
});

const is_delete_pending = computed(() => {
  return workflowService.is_step_pending("delete", dataset.value?.workflows);
});

// const active_wf = ref(false);
const polling_interval = computed(() => {
  return active_wf.value ? config.dataset_polling_interval : null;
});

function fetch_dataset(show_loading = false) {
  loading.value = show_loading;
  DatasetService.getById({
    id: props.datasetId,
    bundle: true,
    initiator: true,
  })
    .then((res) => {
      const _dataset = res.data;
      const _workflows = _dataset?.workflows || [];

      // sort workflows
      _workflows.sort(workflow_compare_fn);
      // add collapse_model to open running workflows
      // keep workflows open that were open
      _dataset.workflows = _workflows.map((w, i) => {
        return {
          ...w,
          collapse_model:
            !workflowService.is_workflow_done(w) ||
            (dataset.value?.workflows || [])[i]?.collapse_model ||
            false,
        };
      });
      dataset.value = _dataset;
    })
    .catch((err) => {
      console.error(err);
      if (err?.response?.status == 404)
        toast.error("Could not find the dataset");
      else toast.error("Could not fetch datatset");
    })
    .finally(() => {
      loading.value = false;
    });
}

// initial data fetch
watch(
  [() => props.datasetId],
  () => {
    fetch_dataset(true);
  },
  { immediate: true },
);

/**
 * providing the interval directly will kick of the polling immediately
 * provide a ref which will resolve to null when there are no active workflows
 * and to 10s otherwise now it can be controlled by resume and pause whenever
 * active_wf changes
 */
const poll = useIntervalFn(fetch_dataset, polling_interval);

watch(active_wf, (newVal, _) => {
  if (newVal) {
    poll.resume();
  } else {
    poll.pause();
  }
});

function workflow_compare_fn(a, b) {
  /* compareFn: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
   * sort by status and created_at
   * not done status has higher precedence
   */
  const is_a_done = workflowService.is_workflow_done(a);
  const is_b_done = workflowService.is_workflow_done(b);
  const order_by_done = is_a_done - is_b_done;

  if (!order_by_done) {
    return new Date(b.created_at) - new Date(a.created_at);
  }
  return order_by_done;
}

function stage_dataset() {
  stage_modal.value = false;
  loading.value = true;
  DatasetService.stage_dataset(dataset.value.id)
    .then(() => {
      fetch_dataset(true);
    })
    .finally(() => {
      loading.value = false;
    });
}

function delete_archive() {
  delete_archive_modal.value.visible = false;
  loading.value = true;
  DatasetService.delete_dataset({ id: dataset.value.id })
    .then(() => {
      toast.success("A workflow has started to delete the dataset");
      fetch_dataset(true);
    })
    .catch((err) => {
      console.error("unable to delete the dataset", err);
      toast.error("Unable to delete the dataset");
    })
    .finally(() => {
      loading.value = false;
    });
}

const editModal = ref(null);

function openModalToEditDataset() {
  editModal.value.show();
}

function navigateToFileBrowser() {
  if (props.appendFileBrowserUrl) {
    router.push(route.path + "/filebrowser");
  } else {
    router.push(`/datasets/${props.datasetId}/filebrowser`);
  }
}

const downloadModal = ref(null);
function openModalToDownloadDataset() {
  downloadModal.value.show();
}
</script>

<route lang="yaml">
meta:
  title: Dataset
  requiresRoles: ["operator", "admin"]
</route>
