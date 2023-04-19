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
      <div v-if="props.show_batch && batch_id">
        <span class="text-sm">
          Sequencing Run:
          <router-link :to="`/runs/${batch_id}`" class="va-link"
            >#{{ batch_id }}</router-link
          >
        </span>
      </div>
    </div>

    <div class="col-span-1">
      <div v-show="workflow.steps_done != workflow.total_steps">
        <va-progress-circle :thickness="0.1" indeterminate>
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
import useTimer from "@/composables/useTimer";
import { format_duration, utc_date_to_local_tz } from "@/services/utils";
import workflowService from "@/services/workflow";

const props = defineProps({
  workflow: Object,
  show_batch: {
    type: Boolean,
    default: false,
  },
});

const workflow = ref({});
let elapsed_time = null;
const batch_id = computed(() => {
  // batch_id is the first argument of the args in the task object
  const a_step = (workflow.value?.steps || [])[0];
  const x = (a_step?.last_task_run?.args || [])[0];
  return x;
});

// to watch props make them reactive or wrap them in functions
watch(
  [() => props.workflow],
  () => {
    // runs when collectionStats are updated
    workflow.value = props.workflow;
    if (!workflowService.is_workflow_done(workflow.value)) {
      elapsed_time = useTimer(workflow.value.created_at);
    } else {
      const duration = moment.duration(
        moment.utc(workflow.value.updated_at) -
          moment.utc(workflow.value.created_at)
      );
      elapsed_time = format_duration(duration);
    }
  },
  {
    immediate: true,
  }
);
</script>
