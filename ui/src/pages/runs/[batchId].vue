<template>
  <va-inner-loading :loading="loading">
    <div>
      <span class="text-3xl">Sequencing Run : {{ batch.name }}</span>
      <va-divider />
    </div>
    <div>
      <div class="flex flex-row flex-wrap gap-3">
        <div class="flex-[3_1_0%]">
          <va-card>
            <va-card-title>
              <span class="text-xl">Info</span>
            </va-card-title>
            <va-card-content v-if="Object.keys(batch || {}).length > 0">
              <batch-info :batch="batch"></batch-info>
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
        <div class="flex-[2_1_0%] flex flex-col gap-3 justify-start">
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
      <div class="mt-3">
        <span class="flex text-xl my-2">Workflows</span>
        <!-- TODO: add filter based on workflow status -->
        <!-- TODO: remove delete workflow feature. Instead have delete archive feature -->
        <div v-for="workflow in batch.workflows" :key="workflow.id">
          <va-collapse flat class="mb-6">
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
          </va-collapse>
        </div>
      </div>
    </div>
  </va-inner-loading>
</template>

<script setup>
import moment from "moment";
import BatchService from "../../services/batch";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";

const props = defineProps({ batchId: String });

const batch = ref({});
const description = ref("");
const edit_discription = ref(false);
const loading = ref(false);
// const collapsibles = ref([{ value: true }, { value: false }]);

function fetch_batch(show_loading = false) {
  loading.value = show_loading;
  BatchService.getById(props.batchId)
    .then((res) => {
      const _batch = res.data;
      // _batch.workflows[1].status = "STARTED";
      _batch?.workflows.sort((a, b) => {
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
      });
      batch.value = _batch;
    })
    .catch((err) => {
      if (err?.response?.status == 404)
        toast.error("Could not find the Sequencing Run");
      else toast.error("Something went wrong");
    })
    .finally(() => {
      loading.value = false;
    });
}

fetch_batch(true);
// const fetch_interval = setInterval(fetch_batch, 10000);

// onBeforeUnmount(() => {
//   if (fetch_interval) {
//     clearInterval(fetch_interval);
//   }
// });
</script>
