<template>
  <div class="grid grid-cols-6 lg:grid-cols-12 gap-5 items-center px-2">
    <div class="col-span-1">
      <WorkflowStatusIcon :status="workflow.status" class="text-xl" />
    </div>

    <div class="col-span-5 flex flex-col">
      <span class="text-lg font-semibold capitalize">
        {{ workflow.name }}
      </span>
      <span class="text-sm"> {{ workflow.id }} </span>
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
        <span class="pl-2">
          {{
            moment
              .utc(workflow.created_at)
              .tz(moment.tz.guess())
              .format("YYYY-MM-DD HH:mm z")
          }}
        </span>
      </va-popover>
    </div>

    <div class="col-span-2">
      <va-popover message="Duration" placement="top" hover-over-timeout="500">
        <i-mdi-timer class="text-xl inline-block text-slate-700" />
        <span class="pl-2"> {{ elapsed_time }} </span>
      </va-popover>

      <div v-if="!workflowService.is_workflow_done(workflow)">
        <va-popover message="Last Updated" hover-over-timeout="500">
          <i-mdi-update class="inline-block text-slate-700 pl-1" />
          <span class="text-sm pl-2">
            {{ moment(workflow.updated_at).fromNow() }}
          </span>
        </va-popover>
      </div>
    </div>
  </div>
</template>

<script setup>
import moment from "moment-timezone";
import WorkflowStatusIcon from "@/components/runs/WorkflowStatusIcon.vue";
import useTimer from "@/composables/useTimer";
import { format_duration } from "@/services/utils";
import workflowService from "@/services/workflow";

const props = defineProps({ workflow: Object });

const workflow = ref({});
let elapsed_time = null;

// to watch props make them reactive or wrap them in functions
watch(
  [() => props.workflow],
  () => {
    // runs when collectionStats are updated
    workflow.value = props.workflow;
    // console.log(workflow.value);
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
