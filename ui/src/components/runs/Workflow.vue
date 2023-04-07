<template>
  <va-inner-loading :loading="loading">
    <div v-if="workflow" class="pb-2">
      <div class="mb-2" v-if="!workflowService.is_workflow_done(workflow)">
        <va-progress-bar indeterminate size="0.3rem" />
      </div>
      <va-data-table :items="row_items" :columns="columns" :hoverable="true">
        <template #cell(step)="{ source }">
          <div class="flex gap-3 justify-start items-center">
            <span
              style="text-transform: capitalize"
              class="text-lg flex-initial"
            >
              {{ source.name }}
            </span>
            <span
              v-if="source?.progress?.name"
              class="text-slate-500 flex-initial"
            >
              {{ source?.progress?.name }}
            </span>
            <va-progress-circle
              v-if="source?.progress?.percent_done"
              class="flex-initial"
              :thickness="0.1"
              :modelValue="source?.progress?.percent_done"
            >
              {{ source?.progress?.percent_done }}%
            </va-progress-circle>
          </div>
        </template>
        <template #cell(status)="{ source }">
          <workflow-status-pill :status="source" />
        </template>
      </va-data-table>

      <div class="flex justify-end">
        <div class="flex-initial">
          <div
            v-if="['REVOKED', 'FAILURE'].includes(workflow.status)"
            class="flex justify-start items-center gap-3"
          >
            <confirm-hold-button
              action="Resume Workflow"
              icon="mdi-play"
              color="primary"
              @click="resume_workflow"
            ></confirm-hold-button>

            <confirm-button
              action="Delete Workflow"
              icon="mdi-delete"
              color="danger"
              @click="delete_workflow"
            ></confirm-button>
          </div>

          <div v-else-if="workflow.status == 'SUCCESS'">
            <confirm-button
              action="Delete Workflow"
              icon="mdi-delete"
              color="danger"
              @click="delete_workflow"
            ></confirm-button>
          </div>

          <div v-else>
            <confirm-button
              action="Stop Workflow"
              icon="mdi-stop-circle-outline"
              color="danger"
              @click="pause_workflow"
            ></confirm-button>
          </div>
        </div>
      </div>
    </div>
  </va-inner-loading>
</template>

<script setup>
import moment from "moment";
// import { capitalize } from "../../services/utils";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";

const props = defineProps({ workflow: Object });
const emit = defineEmits(["update"]);

const loading = ref(false);
const workflow = ref();

// to watch props make them reactive or wrap them in functions
watch(
  [() => props.workflow],
  () => {
    // runs when collectionStats are updated
    workflow.value = props.workflow;
    // console.log(workflow.value);
  },
  {
    immediate: true,
  }
);

function compute_step_duration(step) {
  if (step.last_task_run) {
    const task = step.last_task_run;
    if (task.date_start && (task.status === "PROGRESS" || task.date_done)) {
      const start_time = moment.utc(task.date_start);
      const end_time =
        task.status === "PROGRESS" ? moment.utc() : moment.utc(task.date_done);
      // console.log(start_time, end_time, moment);
      const duration = moment.duration(end_time - start_time);
      return duration.humanize();
    }
  }
  return "";
}

function get_progress_obj(step) {
  if (step?.status == "PROGRESS" && step?.last_task_run?.result) {
    const progress = step?.last_task_run?.result;
    const percent_done = progress.percent_done
      ? Math.round(progress.percent_done * 100)
      : null;
    return {
      name: progress?.name,
      percent_done,
    };
  }
  return null;
}

const row_items = computed(() => {
  return workflow.value?.steps?.map((s) => {
    return {
      step: {
        name: s.name,
        progress: get_progress_obj(s),
      },
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
  { key: "status" },
  { key: "start_date" },
  { key: "duration" },
]);

function delete_workflow() {
  loading.value = true;
  workflowService
    .delete(workflow.value.id)
    .then((res) => {
      console.log(res);
      toast.success("Deleted workflow");
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to delete workflow");
    })
    .finally(() => {
      emit("update");
      loading.value = false;
    });
}

function resume_workflow() {
  loading.value = true;
  workflowService
    .resume(workflow.value.id)
    .then((res) => {
      console.log(res);
      toast.success("Resumed workflow");
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to resume workflow");
    })
    .finally(() => {
      emit("update");
      loading.value = false;
    });
}

function pause_workflow() {
  loading.value = true;
  workflowService
    .pause(workflow.value.id)
    .then((res) => {
      console.log(res);
      toast.success("Stopped workflow");
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to stop workflow");
    })
    .finally(() => {
      emit("update");
      loading.value = false;
    });
}
</script>
