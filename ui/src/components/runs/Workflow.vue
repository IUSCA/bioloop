<template>
  <va-inner-loading :loading="loading">
    <div v-if="workflow" class="pb-2">
      <div class="mb-2" v-if="!workflowService.is_workflow_done(workflow)">
        <va-progress-bar indeterminate size="0.3rem" />
      </div>

      <!-- Steps Table -->
      <va-data-table :items="row_items" :columns="columns">
        <template #cell(step)="{ source }">
          <div class="flex gap-3 justify-start items-center min-w-[150px]">
            <span style="text-transform: uppercase" class="flex-initial">
              {{ source.name }}
            </span>

            <!-- retries -->
            <span v-if="source.retries" class="">
              <i-mdi-refresh class="text-sm inline mt-[-3px]" />{{
                source.retries
              }}
            </span>

            <!-- progress name -->
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

            <!-- time remaining -->
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

      <!-- Error message -->
      <div>
        <WorkflowError :workflow="workflow" />
      </div>

      <va-divider />

      <!-- Actions -->
      <div class="flex justify-end">
        <div class="flex-none pr-2">
          <div
            v-if="['REVOKED', 'FAILURE'].includes(workflow.status)"
            class="flex justify-start items-center gap-3"
          >
            <confirm-button
              action="Resume Workflow"
              icon="mdi-play"
              color="primary"
              :disabled="is_resume_locked"
              @click="resume_workflow"
            ></confirm-button>

            <confirm-hold-button
              v-if="auth.canAdmin"
              action="Delete Workflow"
              icon="mdi-delete"
              color="danger"
              @click="delete_workflow"
            ></confirm-hold-button>
          </div>

          <div v-else-if="workflow.status == 'SUCCESS'">
            <confirm-hold-button
              v-if="auth.canAdmin"
              action="Delete Workflow"
              icon="mdi-delete"
              color="danger"
              @click="delete_workflow"
            ></confirm-hold-button>
          </div>

          <div v-else>
            <div class="flex justify-start items-center gap-3">
              <confirm-button
                action="Stop Workflow"
                icon="mdi-stop-circle-outline"
                color="danger"
                @click="pause_workflow"
              ></confirm-button>
              <va-button
                v-if="auth.canOperate && force_resume_candidate"
                color="warning"
                preset="primary"
                :disabled="!can_force_resume"
                data-testid="workflow-force-resume"
                @click="show_force_resume_modal"
              >
                <Icon icon="mdi:restart" class="mr-2 text-xl" />
                Force resume
              </va-button>
              <confirm-hold-button
                v-if="auth.canAdmin"
                action="Delete Workflow"
                icon="mdi-delete"
                color="danger"
                @click="delete_workflow"
              ></confirm-hold-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </va-inner-loading>

  <va-modal
    v-model="force_resume_modal_visible"
    title="Force resume workflow?"
    size="small"
    fixed-layout
    hide-default-actions
    no-outside-dismiss
    @cancel="hide_force_resume_modal"
  >
    <div class="space-y-4" data-testid="workflow-force-resume-confirmation">
      <p>
        Submit a new task for step
        <strong>{{ force_resume_target?.stepName }}</strong>
        in workflow
        <span class="break-all">{{ force_resume_target?.workflowId }}</span
        >?
      </p>
      <va-alert color="warning">
        Force resume does not stop an existing task. If the original task is
        still running, this will create two concurrent runs of the same step.
        Check worker processes and logs before continuing.
      </va-alert>
      <p class="text-sm">
        Last recorded workflow update:
        {{ datetime.absolute(force_resume_target?.updatedAt) }}. The workflow
        has not been updated for at least
        {{ config.workflow.force_resume_stale_hours }} hours. This is not a task
        heartbeat and does not prove that the task has stopped.
      </p>
      <va-checkbox
        v-model="confirmed_no_task"
        label="I have confirmed that no task is running for this step."
        data-testid="workflow-force-resume-acknowledgement"
      />
    </div>
    <template #footer>
      <div class="flex justify-end gap-3">
        <va-button preset="secondary" @click="hide_force_resume_modal">
          Cancel
        </va-button>
        <va-button
          color="warning"
          :disabled="!can_confirm_force_resume"
          data-testid="workflow-force-resume-submit"
          @click="force_resume_workflow"
        >
          Force resume
        </va-button>
      </div>
    </template>
  </va-modal>

  <ProcessLogsModal ref="logsModal" />
</template>

<script setup>
import config from "@/config";
import * as datetime from "@/services/datetime";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";
import { useAuthStore } from "@/stores/auth";
import { useNow } from "@vueuse/core";

const props = defineProps({ workflow: Object });
const emit = defineEmits(["update"]);

const loading = ref(false);
const workflow = ref(props.workflow);
const now = useNow({ interval: 60000 });
const force_resume_modal_visible = ref(false);
const confirmed_no_task = ref(false);
const force_resume_target = ref(null);
const submitted_force_resume_signature = ref(null);

const auth = useAuthStore();

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
    if (task.date_start && ("STARTED" === task.status || task.date_done)) {
      const start_time = new Date(task.date_start);
      const end_time =
        "STARTED" === task.status ? new Date() : new Date(task.date_done);
      const duration = end_time - start_time;
      return datetime.formatDuration(duration);
    }
  }
  return "";
}

function get_progress_obj(step) {
  if ("STARTED" === step?.status && step?.last_task_run?.result) {
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
        retries: s.last_task_run?.retries,
      },
      start_date: s?.last_task_run?.date_start
        ? datetime.absolute(s.last_task_run.date_start)
        : "",
      status: s?.status || "PENDING",
      duration: compute_step_duration(s),
    };
  });
});

const is_resume_locked = computed(() => {
  /**
   * Computes whether the resume lock is enabled for the workflow.
   *
   * @returns {boolean} True if the resume lock is enabled, false otherwise.
   */
  return !!workflow.value?.resume_lock;
});

const force_resume_candidate = computed(() =>
  workflowService.get_force_resume_candidate(
    workflow.value,
    config.workflow.force_resume_stale_hours * 60 * 60 * 1000,
    now.value.getTime(),
  ),
);

const force_resume_signature = computed(() => {
  const candidate = force_resume_candidate.value;
  return candidate
    ? JSON.stringify([
        workflow.value.id,
        candidate.stepName,
        candidate.taskId,
        candidate.status,
        candidate.lastActivityAt,
      ])
    : null;
});

const can_force_resume = computed(
  () =>
    auth.canOperate &&
    !!force_resume_candidate.value &&
    !is_resume_locked.value &&
    !loading.value &&
    submitted_force_resume_signature.value !== force_resume_signature.value,
);

const can_confirm_force_resume = computed(
  () =>
    force_resume_modal_visible.value &&
    confirmed_no_task.value &&
    can_force_resume.value &&
    force_resume_target.value?.signature === force_resume_signature.value,
);

watch([force_resume_signature, () => auth.canOperate, is_resume_locked], () => {
  if (
    force_resume_modal_visible.value &&
    (!auth.canOperate ||
      is_resume_locked.value ||
      force_resume_target.value?.signature !== force_resume_signature.value)
  ) {
    hide_force_resume_modal();
  }
});

watch(force_resume_modal_visible, (visible) => {
  if (!visible) {
    confirmed_no_task.value = false;
    force_resume_target.value = null;
  }
});

const columns = ref([
  {
    key: "step",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;",
  },
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

function show_force_resume_modal() {
  if (!can_force_resume.value) return;

  confirmed_no_task.value = false;
  force_resume_target.value = {
    workflowId: workflow.value.id,
    stepName: force_resume_candidate.value.stepName,
    updatedAt: force_resume_candidate.value.updatedAt,
    signature: force_resume_signature.value,
  };
  force_resume_modal_visible.value = true;
}

function hide_force_resume_modal() {
  force_resume_modal_visible.value = false;
  confirmed_no_task.value = false;
  force_resume_target.value = null;
}

function force_resume_workflow() {
  if (!can_confirm_force_resume.value) return;

  const expectedSignature = force_resume_target.value.signature;
  hide_force_resume_modal();
  return resume_workflow({ force: true, expectedSignature });
}

async function resume_workflow({
  force = false,
  expectedSignature = null,
} = {}) {
  if (loading.value || is_resume_locked.value) return;
  if (force && !auth.canOperate) return;

  const workflowId = workflow.value.id;
  loading.value = true;

  try {
    if (force) {
      // Recheck the target before submitting; polling may have shown old state.
      const { data } = await workflowService.getById(workflowId, true, true);
      if (workflow.value.id !== workflowId) return;
      workflow.value = data;

      if (
        !auth.canOperate ||
        is_resume_locked.value ||
        !force_resume_candidate.value ||
        force_resume_signature.value !== expectedSignature
      ) {
        toast.error(
          "Workflow changed. Review its current state before forcing a resume.",
        );
        return;
      }
    }

    const res = await workflowService.resume(workflowId, { force });
    if (res.data?.resumed) {
      if (force) submitted_force_resume_signature.value = expectedSignature;
      toast.success(force ? "Submitted force resume" : "Resumed workflow");
    } else {
      toast.error("Unable to resume workflow");
    }
    return res;
  } catch (err) {
    console.error(err);
    toast.error("Unable to resume workflow");
  } finally {
    // Give the worker time to accept the task before refreshing the parent.
    setTimeout(() => {
      emit("update");
    }, 2000);
    loading.value = false;
  }
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
