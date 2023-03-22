<template>
  <va-inner-loading :loading="loading">
    <div v-if="workflow">
      <div class="mb-2" v-if="!is_workflow_done()">
        <va-progress-bar indeterminate size="0.3rem" />
      </div>
      <div class="grid grid-cols-3">
        <div class="flex flex-col gap-2">
          <div>
            ID: <span class="pl-3">{{ workflow.id }}</span>
          </div>
          <div v-if="workflow.name">
            Name: <span class="pl-3">{{ workflow.name }}</span>
          </div>
          <div>
            Status:
            <span class="pl-3">
              <workflow-status-pill :status="workflow.status" />
            </span>
          </div>
        </div>
        <div class="">
          <div>
            Created:
            <span class="pl-3">
              {{
                moment.utc(workflow.created_at).format("YYYY-MM-DD HH:mm:ss")
              }}
              UTC
            </span>
          </div>
          <div>
            Updated:
            <span class="pl-3">
              {{
                moment.utc(workflow.updated_at).format("YYYY-MM-DD HH:mm:ss")
              }}
              UTC
            </span>
          </div>
        </div>
        <div class="flex justify-center">
          <div class="flex-initial">
            <div v-if="['REVOKED', 'FAILURE'].includes(workflow.status)">
              <confirm-hold-button
                action="Resume Workflow"
                icon="mdi-play"
                color="primary"
                @click="resume_workflow"
              ></confirm-hold-button>
            </div>

            <div v-if="workflow.status == 'SUCCESS'">
              <confirm-button
                action="Delete Workflow"
                icon="mdi-delete"
                color="danger"
                @click="delete_workflow"
              ></confirm-button>
            </div>

            <div v-if="['STARTED', 'PROGRESS'].includes(workflow.status)">
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

      <va-data-table
        style="margin-top: 30px"
        :items="row_items"
        :columns="columns"
        :hoverable="true"
      >
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
    </div>
  </va-inner-loading>
</template>

<script setup>
import moment from "moment";
// import { capitalize } from "../../services/utils";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";

const props = defineProps({ batch: Object });
const emit = defineEmits(["update"]);

const loading = ref(false);
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
      const start_time = moment.utc(task.date_start);
      const end_time =
        task.status === "PROGRESS" ? moment.utc() : moment.utc(task.date_done);
      console.log(start_time, end_time, moment);
      const duration = moment.duration(end_time - start_time);
      return duration.humanize();
    }
  }
  return "";
}

function get_progress_obj(step) {
  if (step?.status == "PROGRESS" && step?.last_task_run?.result) {
    const progress = step?.last_task_run?.result;
    const sub_step_names = progress?.name?.split(".");
    const name = sub_step_names[sub_step_names.length - 1];
    const percent_done = progress.percent_done
      ? Math.round(progress.percent_done * 100)
      : null;
    return {
      name,
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

function is_workflow_done() {
  return ["REVOKED", "FAILURE", "SUCCESS"].includes(workflow.value?.status);
}

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
