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
                moment(workflow.created_at).utc().format("YYYY-MM-DD HH:mm:ss")
              }}
            </span>
          </div>
          <div>
            Updated:
            <span class="pl-3">
              {{
                moment(workflow.updated_at).utc().format("YYYY-MM-DD HH:mm:ss")
              }}
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
              <confirm-hold-button
                action="Delete Workflow"
                icon="mdi-delete"
                color="danger"
                @click="delete_workflow"
              ></confirm-hold-button>
            </div>

            <div v-if="['STARTED', 'PROGRESS'].includes(workflow.status)">
              <confirm-hold-button
                action="Stop Workflow"
                icon="mdi-stop-circle-outline"
                color="danger"
                @click="pause_workflow"
              ></confirm-hold-button>
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
        <template #cell(status)="{ source }">
          <workflow-status-pill :status="source" />
        </template>
      </va-data-table>
    </div>
  </va-inner-loading>
</template>

<script setup>
import moment from "moment";
import { capitalize } from "../../services/utils";
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
}

function pause_workflow() {
  loading.value = true;
}
</script>
