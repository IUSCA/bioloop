<template>
  <div v-if="workflow">
    <div class="flex gap-3">
      <div class="flex-1 flex flex-col gap-2">
        <div>
          ID: <span class="pl-3">{{ workflow.id }}</span>
        </div>
        <div>
          Status: <span class="pl-3"> {{ workflow.status }}</span>
        </div>
      </div>
      <div class="flex-1">
        <!-- <div>
          Created:
          <span>{{
            moment(workflow.created_at).utc().format("YYYY-MM-DD HH:mm:ss")
          }}</span>
        </div> -->
      </div>
      <div class="flex-1">
        <span class="text-lg">Actions</span>
      </div>
    </div>
    <va-data-table
      style="margin-top: 30px"
      :items="row_items"
      :columns="columns"
      :hoverable="true"
    >
      <!-- <template #cell(status)="{ value }">
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
    </template> -->
    </va-data-table>
  </div>
</template>

<script setup>
import moment from "moment";
import { capitalize } from "../../services/utils";

const props = defineProps({ batch: Object });
const workflow = ref();

// to watch props make them reactive or wrap them in functions
watch(
  [() => props.batch],
  () => {
    // runs when collectionStats are updated
    workflow.value = props.batch?.workflow;
    console.log(workflow.value);
  },
  {
    immediate: true,
  }
);

function compute_step_duration(step) {
  if (step.last_task_run) {
    const task = step.last_task_run;
    if (task.date_start && (task.status === "PROGRESS" || task.date_done)) {
      const start_time = moment(task.date_start);
      const end_time =
        task.status === "PROGRESS" ? moment() : moment(task.date_done);
      const duration = moment.duration(end_time - start_time);
      return duration.humanize();
    }
  }
  return "";
}

const row_items = computed(() => {
  return workflow.value?.steps?.map((s) => {
    return {
      step: capitalize(s.name),
      start_date: s?.last_task_run?.date_start
        ? moment(s.last_task_run.date_start).utc().format("YYYY-MM-DD HH:mm:ss")
        : "",
      status: s?.status || "PENDING",
      duration: compute_step_duration(s),
    };
  });
});

const columns = ref([
  { key: "step" },
  { key: "start_date" },
  { key: "duration" },
  { key: "status" },
]);
</script>
