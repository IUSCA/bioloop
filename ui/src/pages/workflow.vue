<template>
  <h2 class="text-3xl font-bold">Workflow - {{ workflow["_id"] }}</h2>
  <div class="mt-10" style="margin-top: 50px">
    <p>Start Date: {{ workflow.start_date }}</p>
    <p>Number of Steps: {{ workflow.steps.length }}</p>
    <p>Status: {{ workflow.status }}</p>

    <!-- <step-progress style="margin-top: 50px" :steps="steps"></step-progress> -->

    <va-data-table
      style="margin-top: 50px"
      :items="row_items"
      :columns="columns"
      :hoverable="true"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortingOrder"
    >
      <template #cell(status)="{ value }">
        <div v-if="JSON.parse(value).status == 'INPROGRESS'">
          <va-progress-circle
            class="mb-2"
            :thickness="0.1"
            :modelValue="JSON.parse(value).progress"
          >
            {{ JSON.parse(value).progress }} %
          </va-progress-circle>
        </div>
        <div v-else>
          {{ JSON.parse(value).status }}
        </div>
      </template>
    </va-data-table>
  </div>
</template>

<script setup>
const workflow = {
  _id: "1fc94ad2-ee78-4f6e-8757-2475c36d6950",
  start_date: "2023-01-11",
  status: "In Progress",
  steps: [
    {
      name: "Registration",
      task: "workers.regsiter",
      task_runs: {
        _id: "bea16c58-404f-4817-8261-b52e422490f2",
        name: "workers.regsiter",
        status: "COMPLETED",
        result: "",
      },
    },
    {
      name: "Inspection",
      task: "workers.inspect",
      task_runs: {
        _id: "d1b600c4-25fd-4053-a867-08cc65acbe30",
        name: "workers.inspect",
        status: "COMPLETED",
        result: "",
      },
    },
    {
      name: "Archiving",
      task: "workers.archive",
      task_runs: {
        _id: "17d1929d-e623-4f7b-aba1-46258147e7cb",
        name: "workers.archive",
        status: "COMPLETED",
        result: "",
      },
    },
    {
      name: "Staging",
      task: "workers.stage",
      task_runs: {
        _id: "088e14a9-ed0f-47cd-a5ff-338d6e818423",
        name: "workers.archive",
        status: "INPROGRESS",
        result: {
          total: 121,
          done: 54,
        },
      },
    },
    {
      name: "Validation",
      task: "workers.validate",
      task_runs: {},
    },
  ],
};

function get_progress(step) {
  let status = step.task_runs && step.task_runs["status"];
  if (status === "INPROGRESS") {
    return Math.round(
      (100 * step.task_runs.result.done) / step.task_runs.result.total
    );
  }
  return null;
}

const steps = ref(
  workflow.steps.map((s) => {
    return {
      name: s["name"],
      completed: s.task_runs && s.task_runs.status === "COMPLETED",
    };
  })
);

const row_items = ref(
  workflow.steps.map((s) => {
    return {
      name: s["name"],
      task: s["task"],
      status: JSON.stringify({
        status: s.task_runs && s.task_runs["status"],
        progress: get_progress(s),
      }),
      duration: "",
    };
  })
);
</script>
