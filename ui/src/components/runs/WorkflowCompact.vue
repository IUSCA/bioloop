<template>
  <div class="grid grid-cols-6 lg:grid-cols-12 gap-5 items-center px-2">
    <div class="col-span-1">
      <WorkflowStatusIcon :status="workflow.status" class="text-xl" />
    </div>

    <div class="col-span-5 flex flex-col">
      <span class="text-lg font-semibold capitalize">
        {{ workflow.name }}
      </span>
      <div>
        <span class="text-sm"> {{ workflow.id }} </span>
      </div>
      <div v-if="props.show_dataset && dataset_id">
        <span class="text-sm">
          Dataset:
          <router-link :to="`/dataset/${dataset_id}`" class="va-link"
            >#{{ dataset_id }}</router-link
          >
        </span>
      </div>
    </div>

    <div class="col-span-1">
      <div v-show="workflow.steps_done != workflow.total_steps">
        <va-progress-circle
          :thickness="0.1"
          :indeterminate="!workflowService.is_workflow_done(workflow)"
        >
          {{ workflow.steps_done }} / {{ workflow.total_steps }}
        </va-progress-circle>
      </div>
    </div>

    <div class="col-span-3">
      <va-popover message="Created On" hover-over-timeout="500">
        <i-mdi-calendar class="text-xl inline-block text-slate-700" />
      </va-popover>
      <span class="pl-2">
        {{ utc_date_to_local_tz(workflow.created_at) }}
      </span>
    </div>

    <div class="col-span-2">
      <va-popover message="Duration" placement="top" hover-over-timeout="500">
        <i-mdi-timer class="text-xl inline-block text-slate-700" />
      </va-popover>
      <span class="pl-2"> {{ elapsed_time }} </span>

      <div
        v-if="
          !workflowService.is_workflow_done(workflow) && workflow.updated_at
        "
      >
        <va-popover message="Last Updated" hover-over-timeout="500">
          <i-mdi-update class="inline-block text-slate-700 pl-1" />
        </va-popover>
        <span class="text-sm pl-2">
          {{ moment.utc(workflow.updated_at).fromNow() }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import moment from "moment-timezone";
import WorkflowStatusIcon from "@/components/runs/WorkflowStatusIcon.vue";
import { format_duration, utc_date_to_local_tz } from "@/services/utils";
import workflowService from "@/services/workflow";

const props = defineProps({
  workflow: Object,
  show_dataset: {
    type: Boolean,
    default: false,
  },
});

const workflow = ref({});
const dataset_id = computed(() => {
  // dataset_id is the first argument of the args in the task object
  const a_step = (workflow.value?.steps || [])[0];
  const x = (a_step?.last_task_run?.args || [])[0];
  return x;
});
const elapsed_time = computed(() => {
  if (!workflowService.is_workflow_done(workflow.value)) {
    const now = moment.utc();
    const duration = moment.duration(
      now - moment.utc(workflow.value.created_at)
    );
    return format_duration(duration);
  } else {
    const duration = moment.duration(
      moment.utc(workflow.value.updated_at) -
        moment.utc(workflow.value.created_at)
    );
    return format_duration(duration);
  }
});

// to watch props make them reactive or wrap them in functions
watch(
  [() => props.workflow],
  () => {
    // runs when collectionStats are updated
    workflow.value = props.workflow;
  },
  {
    immediate: true,
  }
);
</script>
