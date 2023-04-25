<template>
  <div class="flex flex-col gap-4">
    <!-- Storage -->
    <div class="">
      <span class="text-xl font-bold block my-1">RESOURCE USAGE</span>
      <Storage></Storage>
    </div>

    <!-- Sequencing Run Stats -->
    <div class="">
      <span class="text-xl font-bold block my-1">SEQUENCING RUNS</span>
      <router-link to="/runs" class="va-link">
        <stats :data="sequencing_runs_stats"></stats>
      </router-link>
    </div>

    <!-- Data Product Stats -->
    <div class="">
      <span class="text-xl font-bold block my-1">DATA PRODUCTS</span>
      <router-link to="/dataproducts" class="va-link">
        <stats :data="data_products_stats"></stats>
      </router-link>
    </div>

    <!-- Workflows -->
    <div>
      <span class="text-xl font-bold block my-1">ACTIVE WORKFLOWS</span>
      <div v-if="(workflows || []).length > 0">
        <collapsible
          v-for="workflow in workflows"
          :key="workflow.id"
          v-model="workflow.collapse_model"
        >
          <template #header-content>
            <div class="flex-[0_0_90%]">
              <workflow-compact :workflow="workflow" show_batch />
            </div>
          </template>

          <div>
            <workflow :workflow="workflow" @update="update"></workflow>
          </div>
        </collapsible>
      </div>
      <div v-else class="text-center bg-slate-200 py-2 rounded shadow">
        <i-mdi-card-remove-outline class="inline-block text-4xl pr-3" />
        <span class="text-lg"> There are no active workflows. </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import toast from "@/services/toast";
import workflowService from "@/services/workflow";
import rawDataService from "@/services/raw_data";
import dataProductsService from "@/services/dataproducts";

const workflows = ref([]);
const sequencing_runs_stats = ref({});
const data_products_stats = ref({});

workflowService
  .getAll({ last_task_run: true, prev_task_runs: false, only_active: true })
  .then((res) => {
    console.log(res.data);
    workflows.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    if (err?.response?.status == 404)
      toast.error("Could not find the Sequencing Run");
    else toast.error("Something went wrong");
  });

function update() {
  console.log("workflow updated");
}

rawDataService
  .getStats()
  .then((res) => {
    sequencing_runs_stats.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch sequencing runs stats");
  });

dataProductsService
  .getStats()
  .then((res) => {
    data_products_stats.value = res.data;
  })
  .catch((err) => {
    console.error(err);
    toast.error("Unable to fetch data products stats");
  });
</script>

<route lang="yaml">
meta:
  title: Dashboard
</route>
