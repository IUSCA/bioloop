<template>
  <div>
    <div>
      <span class="text-3xl">Sequencing Run : {{ batch.name }}</span>
      <va-divider />
    </div>
    <div>
      <!-- Batch Info + Status Cards -->
      <div class="flex flex-row flex-wrap gap-3">
        <div class="flex-[3_1_0%]">
          <va-card>
            <va-card-title>
              <span class="text-xl">Info</span>
            </va-card-title>
            <va-card-content v-if="Object.keys(batch || {}).length > 0">
              <batch-info :batch="batch"></batch-info>

              <!-- edit description -->
              <div class="flex flex-row gap-2 ml-3 mt-3 mb-6">
                <div class="flex-[0_0_20%]">Description</div>
                <div class="">
                  <div v-if="!edit_discription">
                    <span>{{ batch.description }}</span>
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
        <div class="flex-[2_1_0%] flex flex-col gap-3 justify-start">
          <!-- Archived -->
          <div class="flex-none" v-if="batch.archive_path">
            <va-card>
              <va-card-title>
                <span class="text-lg">Archived</span>
              </va-card-title>
              <va-card-content>
                <div>
                  <span> {{ batch.archive_path }} </span>
                  <copy-button
                    :text="batch.archive_path"
                    class="inline-block ml-3"
                  />
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- Staged for processing -->
          <div class="flex-none" v-if="batch.stage_path">
            <va-card>
              <va-card-title>
                <span class="text-lg">Staged for Processing</span>
              </va-card-title>
              <va-card-content>
                <div class="">
                  <span> {{ batch.stage_path }} </span>
                  <copy-button
                    :text="batch.stage_path"
                    class="inline-block ml-3"
                  />
                </div>
              </va-card-content>
            </va-card>
          </div>

          <!-- Reports -->
          <div class="flex-none" v-if="batch.report_id">
            <va-card>
              <va-card-title>
                <span class="text-lg">Reports</span>
              </va-card-title>
              <va-card-content>
                <div
                  class="flex flex-nowrap justify-between align-center gap-1"
                >
                  <i-mdi-chart-box-outline class="inline text-2xl" />
                  <a
                    class="va-link"
                    target="_blank"
                    :href="`/api/reports/${batch.report_id}/multiqc_report.html`"
                  >
                    <span>MultiQC Report</span>
                    <span class="text-sm pl-2">(opens in new tab)</span>
                  </a>
                </div>
              </va-card-content>
            </va-card>
          </div>
        </div>
      </div>

      <!-- Workflows -->
      <div class="mt-3">
        <span class="flex text-xl my-2 font-bold">WORKFLOWS</span>
        <!-- TODO: add filter based on workflow status -->
        <!-- TODO: remove delete workflow feature. Instead have delete archive feature -->
        <div v-if="batch.workflows">
          <collapsible
            flat
            solid
            class=""
            v-for="workflow in batch.workflows"
            :key="workflow.id"
            v-model="workflow.collapse_model"
          >
            <template #header-content>
              <div class="flex-[0_0_90%]">
                <workflow-compact :workflow="workflow" />
              </div>
            </template>

            <div style="padding: 8px">
              <workflow
                :workflow="workflow"
                @update="fetch_batch(true)"
              ></workflow>
            </div>
          </collapsible>
        </div>
        <div v-else class="text-center bg-slate-100 py-2 rounded shadow">
          <i-mdi-card-remove-outline class="inline-block text-5xl pr-3" />
          <span class="text-lg">
            There are no workflows associated with this batch.
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import moment from "moment";
import BatchService from "../../services/batch";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";
import config from "@/config";

const props = defineProps({ batchId: String });

const batch = ref({});
const description = ref("");
const edit_discription = ref(false);
const loading = ref(false);
const active_wf = computed(() => {
  return (batch.value?.workflows || [])
    .map(workflowService.is_workflow_done)
    .some((x) => !x);
});
// const active_wf = ref(false);
const polling_interval = computed(() => {
  return active_wf.value ? config.batch_polling_interval : null;
});

function fetch_batch(show_loading = false) {
  loading.value = show_loading;
  BatchService.getById(props.batchId)
    .then((res) => {
      const _batch = res.data;
      const _workflows = _batch?.workflows || [];
      // _workflows[1].status = "PROGRESS";
      // _workflows[1].steps_done = 4;

      // sort workflows
      _workflows.sort(workflow_compare_fn);
      // add collapse_model to open running workflows
      // keep workflows open that were open
      _batch.workflows = _workflows.map((w, i) => {
        return {
          ...w,
          collapse_model:
            !workflowService.is_workflow_done(w) ||
            (batch.value?.workflows || [])[i]?.collapse_model ||
            false,
        };
      });
      batch.value = _batch;
    })
    .catch((err) => {
      console.error(err);
      if (err?.response?.status == 404)
        toast.error("Could not find the Sequencing Run");
      else toast.error("Something went wrong");
    })
    .finally(() => {
      loading.value = false;
    });
}

// initial data fetch
fetch_batch(true);

/**
 * providing the interval directly will kick of the polling immediately
 * provide a ref which will resolve to null when there are no active workflows and to 10s otherwise
 * now it can be controlled by resume and pause whenever active_wf changes
 */
const poll = useIntervalFn(fetch_batch, polling_interval);

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
</script>
