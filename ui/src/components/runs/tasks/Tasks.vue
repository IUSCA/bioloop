<template>
  <VaCard>
    <VaCardTitle>
      <span class="text-xl"> Active Tasks </span>
      <span class="font-normal ml-3">
        Last Updated: {{ datetime.fromNow(last_updated) }}
      </span>
    </VaCardTitle>
    <VaCardContent>
      <VaAccordion v-model="accordion" class="max-w-[1080px]" multiple>
        <!-- Steps -->
        <VaCollapse
          v-for="[step_name, tasks] in Object.entries(tasks_by_step)"
          :header="`${step_name.toUpperCase()} (${tasks.length})`"
          :key="step_name"
        >
          <template #content>
            <div class="flex flex-col">
              <div
                class="py-1 border-b last:border-b-0 border-solid border-slate-300 dark:border-slate-700"
                v-for="(task, idx) in tasks"
                :key="idx"
              >
                <Task :task="task" />
              </div>
            </div>
          </template>
        </VaCollapse>
      </VaAccordion>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import config from "@/config";
import * as datetime from "@/services/datetime";
import { cmp } from "@/services/utils";
import workflowService from "@/services/workflow";
// const props = defineProps({});

function default_tasks_by_step() {
  return config.dashboard.active_tasks.steps.reduce((acc, step) => {
    acc[step] = [];
    return acc;
  }, {});
}

const tasks_by_step = ref(default_tasks_by_step());
const last_updated = ref(null);

const accordion = computed({
  get: () => {
    return Object.keys(tasks_by_step.value).map((step) => {
      return tasks_by_step.value[step]?.length > 0;
    });
  },
  set: (val) => {
    return val;
  },
});

function extract_tasks(active_workflows) {
  return active_workflows
    .map((wf) => {
      const step = wf.steps[wf.steps_done]; // todo: add error handling
      const task = step?.last_task_run;
      if (!task) return null;
      return {
        workflow: { id: wf.id, name: wf.name },
        step_number: wf.steps_done + 1,
        name: step.name,
        task_id: task._id,
        task_name: task.name,
        worker: task.worker,
        queue: task.queue,
        date_start: task.date_start,
        retries: task.retries,
        dataset_id: task.args?.length ? task.args[0] : null,
        progress: {
          percent_done:
            task.result?.fraction_done != null
              ? Math.floor(task.result?.fraction_done * 100)
              : null,
          time_remaining_sec: task.result?.time_remaining_sec,
        },
      };
    })
    .filter((x) => x !== null)
    .sort((a, b) => {
      return cmp(a.date_start, b.date_start);
    });
}

function getTasks() {
  return workflowService
    .getAll({
      last_task_run: true,
      status: "STARTED",
      skip: 0,
      limit: 1000,
    })
    .then((res) => {
      const wf_data = res.data?.results || [];

      const active_tasks = extract_tasks(wf_data);

      const _obj = default_tasks_by_step();
      active_tasks.forEach((task) => {
        if (task.name in _obj) _obj[task.name].push(task);
      });
      tasks_by_step.value = _obj;

      last_updated.value = new Date();
    });
}

useIntervalFn(
  () => {
    getTasks();
  },
  config.dashboard.active_tasks.refresh_interval_ms,
  { immediate: true, immediateCallback: true },
);
</script>
