<template>
  <va-card>
    <va-card-title>
      <span class="text-xl"> Storage </span>
    </va-card-title>
    <va-card-content>
      <Storage></Storage>
    </va-card-content>
  </va-card>
  <span class="text-xl font-bold block mt-4">ACTIVE WORKFLOWS</span>
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
</template>

<script setup>
import toast from "@/services/toast";
import workflowService from "@/services/workflow";

const workflows = ref([]);

workflowService
  .getAll(true, false, true)
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
</script>

<route lang="yaml">
meta:
  title: Dashboard
</route>
