<template>
  <va-inner-loading :loading="loading">
    <div v-if="workflow" class="pb-2">
      <div class="mb-2" v-if="!workflowService.is_workflow_done(workflow)">
        <va-progress-bar indeterminate size="0.3rem" />
      </div>
      <va-data-table :items="row_items" :columns="columns">
        <template #cell(step)="{ source }">
          <div class="flex gap-3 justify-start items-center">
            <span style="text-transform: uppercase" class="flex-initial">
              {{ source.name }}
            </span>

            <span
              v-if="!source?.progress?.name"
              class="text-slate-500 flex-initial text-sm"
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

            <span
              v-if="source?.progress?.time_remaining"
              class="text-slate-500 flex-initial text-sm"
            >
              {{ source.progress.time_remaining }} remaining
            </span>
          </div>
        </template>
        <template #cell(status)="{ source }">
          <WorkflowStatusPill :status="source" />
        </template>
        <template #cell(start_date)="{ source }">
          <span class="spacing-wider"> {{ source }} </span>
        </template>

        <template #cell(actions)="{ row, isExpanded }">
          <va-button
            @click="row.toggleRowDetails()"
            :icon="isExpanded ? 'va-arrow-up' : 'va-arrow-down'"
            preset="plain"
          >
            {{ isExpanded ? "Hide" : "More info" }}
          </va-button>
        </template>

        <template #expandableRow="{ rowData }">
          <div class="pr-3 pl-4 bg-slate-200 dark:bg-slate-800">
            <StepProcesses
              :workflow-id="workflow.id"
              :step-name="rowData?.step?.name"
              class="text-sm"
              @show-logs="openLogsModal"
            />
          </div>
        </template>
      </va-data-table>

      <va-divider />
      <div class="flex justify-end">
        <div class="flex-none pr-2">
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
            <div class="flex justify-start items-center gap-3">
              <confirm-button
                action="Stop Workflow"
                icon="mdi-stop-circle-outline"
                color="danger"
                @click="pause_workflow"
              ></confirm-button>
              <confirm-button
                action="Delete Workflow"
                icon="mdi-delete"
                color="danger"
                @click="delete_workflow"
              ></confirm-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </va-inner-loading>

  <ProcessLogsModal ref="logsModal" />
</template>

<script setup>
import workflowService from "@/services/workflow";
import { useToastStore } from "@/stores/toast";
import * as datetime from "@/services/datetime";
const toast = useToastStore();

const props = defineProps({ workflow: Object });
const emit = defineEmits(["update"]);

const loading = ref(false);
const workflow = ref(props.workflow);
// console.log(workflow.value);

// to watch props make them reactive or wrap them in functions
watch(
  [() => props.workflow],
  () => {
    workflow.value = props.workflow;
    fetch_data();
    // console.log(workflow.value);
  },
  {
    immediate: true,
  },
);

function compute_step_duration(step) {
  if (step.last_task_run) {
    const task = step.last_task_run;
    if (
      task.date_start &&
      (["PROGRESS", "STARTED"].includes(task.status) || task.date_done)
    ) {
      const start_time = new Date(task.date_start);
      const end_time = ["PROGRESS", "STARTED"].includes(task.status)
        ? new Date()
        : new Date(task.date_done);
      const duration = end_time - start_time;
      return datetime.formatDuration(duration);
    }
  }
  return "";
}

function get_progress_obj(step) {
  if (
    ["PROGRESS", "STARTED"].includes(step?.status) &&
    step?.last_task_run?.result
  ) {
    const progress = step.last_task_run.result;
    const percent_done = progress.fraction_done
      ? Math.round(progress.fraction_done * 100)
      : null;

    return {
      name: progress?.name,
      percent_done,
      time_remaining: datetime.readableDuration(
        progress.time_remaining_sec * 1000,
      ),
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
        ? datetime.absolute(s.last_task_run.date_start)
        : "",
      status: s?.status || "PENDING",
      duration: compute_step_duration(s),
    };
  });
});

const columns = ref([
  { key: "step" },
  { key: "status", width: "100px", thAlign: "center", tdAlign: "center" },
  { key: "start_date", width: "220px", thAlign: "center", tdAlign: "center" },
  { key: "duration", width: "150px", thAlign: "center", tdAlign: "center" },
  { key: "actions", width: "130px", thAlign: "center", tdAlign: "center" },
]);

function fetch_data(workflow_id) {
  workflowService
    .getById(workflow_id || workflow.value.id, true, true)
    .then((res) => {
      workflow.value = res.data;
    });
}

function delete_workflow() {
  loading.value = true;
  workflowService
    .delete(workflow.value.id)
    .then(() => {
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
      if (res.data?.resumed) {
        toast.success("Resumed workflow");
      } else {
        toast.error("Unable to resume workflow");
      }
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to resume workflow");
    })
    .finally(() => {
      // the workflow status needs a little bit of time to change after successful resumption
      // because a worker needs to accept the new task, which in turn updates the workflow object
      // wait for 2 seconds and then update
      setTimeout(() => {
        emit("update");
      }, 2000);
      loading.value = false;
    });
}

function pause_workflow() {
  loading.value = true;
  workflowService
    .pause(workflow.value.id)
    .then((res) => {
      if (res.data?.paused) {
        toast.success("Stopped workflow");
      } else {
        toast.error("Unable to stop workflow");
      }
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to stop workflow");
    })
    .finally(() => {
      setTimeout(() => {
        emit("update");
      }, 2000);
      loading.value = false;
    });
}

// logs modal
const logsModal = ref(null);

function openLogsModal(id) {
  logsModal.value.show(id);
}
</script>
