<template>
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
            <va-card-content>{{ batch.archive_path }}</va-card-content>
          </va-card>
        </div>
        <div class="flex-none" v-if="batch.stage_path">
          <va-card>
            <va-card-title>
              <span class="text-lg">Staged for Processing</span>
            </va-card-title>
            <va-card-content>{{ batch.stage_path }}</va-card-content>
          </va-card>
        </div>
        <div class="flex-none" v-if="batch.report_id">
          <va-card>
            <va-card-title>
              <span class="text-lg">Reports</span>
            </va-card-title>
            <va-card-content>
              <div class="flex flex-nowrap justify-between align-center gap-1">
                <i-mdi-chart-box-outline class="inline text-2xl" />
                <a
                  class="va-link"
                  target="_blank"
                  :href="`/qc/${batch.report_id}/multiqc_report.html`"
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
      <va-card>
        <va-card-title>
          <span class="text-xl">Workflow</span>
        </va-card-title>
        <va-card-content>
          <workflow :batch="batch"></workflow>
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup>
import BatchService from "../../services/batch";
const props = defineProps({ batchId: String });

const batch = ref({});
const description = ref("");
const edit_discription = ref(false);

BatchService.getById(props.batchId).then((res) => {
  batch.value = res.data;
  console.log("batch.value", batch.value);
});
</script>
