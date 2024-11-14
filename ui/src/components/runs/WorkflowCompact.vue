<template>
  <div class="grid grid-cols-6 lg:grid-cols-12 gap-1 lg:gap-3 items-center p-1">
    <!-- Status -->
    <!-- <div class="col-span-1 row-span-2 lg:row-span-1">
      <WorkflowStatusIcon :status="workflow.status" class="text-xl" />
    </div> -->

    <!-- name and id -->
    <div
      class="col-span-2 lg:col-span-6 flex flex-nowrap items-center gap-3 lg:gap-5"
    >
      <div class="flex-none md:mx-2">
        <WorkflowStatusIcon :status="workflow.status" class="text-xl" />
      </div>
      <div class="flex flex-col">
        <span class="text-lg font-semibold capitalize">
          {{ workflow.name }}

          <!-- hide id in screen sizes medium and below -->
          <span
            class="text-xs pl-2 hidden lg:inline va-text-secondary normal-case"
          >
            {{ workflow.id }}
          </span>
        </span>

        <div v-if="props.show_dataset && dataset_id">
          <div class="flex text-sm gap-x-3">
            <div class="grow">
              <span>
                Dataset:
                <router-link :to="`/datasets/${dataset_id}`" class="va-link"
                  >#{{ dataset_id }}</router-link
                >
              </span>
            </div>

            <div v-if="workflow?.initiator" class="grow gap-2">
              <span>
                Initiated by: {{ workflow.initiator?.name }} (
                {{ workflow.initiator?.username }} )
              </span>
            </div>
          </div>
        </div>
        <div v-else>
          <div class="flex text-sm gap-x-3">
            <div v-if="workflow?.initiator" class="grow">
              <span>
                Initiated by: {{ workflow.initiator?.name }} (
                {{ workflow.initiator?.username }} )
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- progress circle -->
    <div class="col-span-1">
      <div v-show="workflow.steps_done != workflow.total_steps">
        <va-progress-circle
          :thickness="0.1"
          :indeterminate="!workflowService.is_workflow_done(workflow)"
          :color="workflowService.is_workflow_done(workflow) ? 'danger' : null"
          :model-value="
            workflowService.is_workflow_done(workflow)
              ? 100 * (workflow.steps_done / workflow.total_steps)
              : null
          "
        >
          <span class="">
            {{ workflow.steps_done }} / {{ workflow.total_steps }}
          </span>
        </va-progress-circle>
      </div>
    </div>

    <!-- created at -->
    <div class="col-span-2 lg:col-span-3">
      <va-popover message="Created On" :hover-over-timeout="500">
        <i-mdi-calendar
          class="text-xl inline-block text-slate-700 dark:text-slate-300"
        />
      </va-popover>
      <span class="hidden md:inline pl-2 lg:spacing-wider text-sm lg:text-base">
        {{ datetime.absolute(workflow.created_at) }}
      </span>
      <span class="md:hidden pl-2 lg:spacing-wider text-sm lg:text-base">
        {{ datetime.date(workflow.created_at) }}
      </span>
    </div>

    <!-- Elapsed time and last updated -->
    <div class="col-span-1 lg:col-span-2">
      <va-popover message="Duration" placement="top" :hover-over-timeout="500">
        <i-mdi-timer
          class="hidden sm:inline-block text-xl text-slate-700 dark:text-slate-300"
        />
      </va-popover>
      <span class="pl-2"> {{ elapsed_time }} </span>

      <!-- <div
        v-if="
          !workflowService.is_workflow_done(workflow) && workflow.updated_at
        "
      >
        <va-popover message="Last Updated" :hover-over-timeout="500">
          <i-mdi-update
            class="inline-block text-slate-700 dark:text-slate-300 pl-1"
          />
        </va-popover>
        <span class="text-sm pl-2">
          {{ datetime.fromNow(workflow.updated_at) }}
        </span>
      </div> -->
    </div>
  </div>
</template>

<script setup>
import WorkflowStatusIcon from "@/components/runs/WorkflowStatusIcon.vue";
import * as datetime from "@/services/datetime";
import workflowService from "@/services/workflow";

const props = defineProps({
  workflow: Object,
  show_dataset: {
    type: Boolean,
    default: false,
  },
});

// eslint-disable-next-line vue/no-dupe-keys
const workflow = ref({});
const dataset_id = computed(() => {
  // dataset_id is the first argument of the args in the task object
  const a_step = (workflow.value?.steps || [])[0];
  const x = (a_step?.last_task_run?.args || [])[0];
  return x;
});
const elapsed_time = computed(() => {
  if (!workflowService.is_workflow_done(workflow.value)) {
    const now = new Date();
    const duration = now - new Date(workflow.value.created_at);
    return datetime.formatDuration(duration);
  } else {
    const duration =
      new Date(workflow.value.updated_at) - new Date(workflow.value.created_at);

    return datetime.formatDuration(duration);
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
  },
);
</script>
