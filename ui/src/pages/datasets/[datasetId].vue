<template>
  <va-inner-loading :loading="loading">
    <div>
      <span class="text-3xl capitalize" v-if="dataset.type">
        {{ dataset.type.replace("_", " ").toLowerCase() }} :
      </span>
      <span class="text-3xl"> {{ dataset.name }} </span>
      <va-divider />
    </div>
    <div>
      <!-- Dataset Info + Status Cards -->
      <div class="flex flex-row flex-wrap gap-3">
        <div class="flex-[3_1_0%]">
          <va-card>
            <va-card-title>
              <span class="text-xl">Info</span>
            </va-card-title>
            <va-card-content v-if="Object.keys(dataset || {}).length > 0">
              <dataset-info :dataset="dataset"></dataset-info>

              <!-- edit description -->
              <div class="flex flex-row gap-2 ml-3 mt-3 mb-6">
                <div class="flex-[0_0_20%]">Description</div>
                <div class="">
                  <div v-if="!edit_discription">
                    <span>{{ dataset.description }}</span>
                    <!-- <va-button
                  preset="primary"
                  round
                  @click="edit_discription = true"
                >
                  <i-mdi-pencil-outline />
                </va-button> -->
                  </div>
                  <div v-else>
                    <va-input
                      class="w-96"
                      v-model="description"
                      type="textarea"
                      autosize
                    />
                  </div>
                </div>
              </div>
            </va-card-content>
          </va-card>
        </div>

        <!-- Status Cards -->
        <div
          class="flex-[2_1_0%] flex flex-col gap-3 justify-start"
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
                  <span> {{ dataset.archive_path }} </span>
                  <copy-button
                    :text="dataset.archive_path"
                    class="inline-block ml-3"
                  />
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- Staged for processing -->
          <div
            class="flex-none"
            v-if="DatasetService.is_staged(dataset?.states)"
          >
            <va-card>
              <va-card-title>
                <span class="text-lg">Staged for Processing</span>
              </va-card-title>
              <va-card-content>
                <div class="">
                  <span> {{ DatasetService.get_staged_path(dataset) }} </span>
                  <copy-button
                    :text="DatasetService.get_staged_path(dataset)"
                    class="inline-block ml-3"
                  />
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
                    :disabled="is_stage_pending"
                    color="primary"
                    border-color="primary"
                    preset="secondary"
                    class="flex-initial"
                    @click="stage_modal = true"
                  >
                    <i-mdi-download class="pr-2 text-2xl" />
                    Stage Files
                  </va-button>

                  <!-- Delete Action Button-->
                  <va-button
                    v-if="dataset.archive_path"
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
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- stage modal -->
          <va-modal
            :model-value="stage_modal"
            message="Stage all files in this dataset from the SDA?"
            @ok="stage_dataset"
            @cancel="stage_modal = !stage_modal"
          />

          <!-- delete archive modal -->
          <va-modal
            :model-value="delete_archive_modal.visible"
            max-width="480px"
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
              <p class="text-lg font-semibold">
                Delete
                <span class="capitalize"> {{ dataset.type }} </span>
                : <span class="uppercase"> {{ dataset.name }} </span>
              </p>

              <va-divider class="my-2" />

              <div class="flex flex-col items-center gap-2">
                <div><i-mdi-zip-box-outline class="text-3xl" /></div>
                <span class="text-xl font-semibold tracking-wide">
                  {{ dataset.name }}
                </span>
                <div class="flex items-center gap-5">
                  <div class="flex items-center gap-1">
                    <i-mdi-harddisk class="text-xl" />
                    <span> {{ formatBytes(dataset.du_size) }} </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <i-mdi-file-multiple class="text-xl" />
                    <span> {{ dataset.num_genome_files }} </span>
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
                    <span class="path bg-slate-200">
                      {{ DatasetService.get_staged_path(dataset) }}
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

      <!-- Audit logs -->
      <div
        class="mt-3"
        v-if="dataset.audit_logs && dataset.audit_logs.length > 0"
      >
        <va-card>
          <va-card-title>
            <span class="text-xl font-bold"> AUDIT LOG </span>
          </va-card-title>
          <va-card-content>
            <dataset-audit-logs :logs="dataset.audit_logs" />
          </va-card-content>
        </va-card>
      </div>

      <!-- Workflows -->
      <div class="mt-3">
        <span class="flex text-xl my-2 font-bold">WORKFLOWS</span>
        <!-- TODO: add filter based on workflow status -->
        <!-- TODO: remove delete workflow feature. Instead have delete archive feature -->
        <div v-if="(dataset.workflows || []).length > 0">
          <collapsible
            v-for="workflow in dataset.workflows"
            :key="workflow.id"
            v-model="workflow.collapse_model"
          >
            <template #header-content>
              <div class="flex-[0_0_90%]">
                <workflow-compact :workflow="workflow" />
              </div>
            </template>

            <div>
              <workflow
                :workflow="workflow"
                @update="fetch_dataset(true)"
              ></workflow>
            </div>
          </collapsible>
        </div>
        <div v-else class="text-center bg-slate-200 py-2 rounded shadow">
          <i-mdi-card-remove-outline class="inline-block text-4xl pr-3" />
          <span class="text-lg">
            There are no workflows associated with this datatset.
          </span>
        </div>
      </div>
    </div>
  </va-inner-loading>
</template>

<script setup>
import moment from "moment";
import DatasetService from "@/services/dataset";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";
import config from "@/config";
import { formatBytes } from "@/services/utils";

const props = defineProps({ datasetId: String });

const dataset = ref({});
const description = ref("");
const edit_discription = ref(false);
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
  DatasetService.getById({ id: props.datasetId })
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
      else toast.error("Something went wrong. Could not fetch datatset");
    })
    .finally(() => {
      loading.value = false;
    });
}

// initial data fetch
fetch_dataset(true);

/**
 * providing the interval directly will kick of the polling immediately
 * provide a ref which will resolve to null when there are no active workflows and to 10s otherwise
 * now it can be controlled by resume and pause whenever active_wf changes
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
   * sort by status, created_at
   * not done status has higher precedence
   */
  const is_a_done = workflowService.is_workflow_done(a);
  const is_b_done = workflowService.is_workflow_done(b);
  const order_by_done = is_a_done - is_b_done;

  if (!order_by_done) {
    return moment.duration(moment(b.created_at) - moment(a.created_at));
  }
  return order_by_done;
}

function stage_dataset() {
  stage_modal.value = false;
  loading.value = true;
  DatasetService.stage_dataset(dataset.value.id)
    .then(() => {
      toast.success("A workflow has started to stage the dataset");
      fetch_dataset(true);
    })
    .catch((err) => {
      console.error("unable to stage the dataset", err);
      toast.error("Unable to stage the dataset");
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
</script>
