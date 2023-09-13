<template>
  <va-list class="space-y-2">
    <va-list-item v-for="p in processes" :key="p.id">
      <!-- args, pid, and hostname -->
      <va-list-item-section>
        <va-list-item-label>
          <span class="va-text-code whitespace-break-spaces"
            >$ {{ p.tags?.args?.join(" ") }}</span
          >
        </va-list-item-label>
        <va-list-item-label caption>
          <!-- <span>Task ID: {{ p.task_id }} </span> -->
          <div class="flex gap-3 pt-1">
            <div class="flex gap-1 flex-none">
              <i-mdi-cog class="flex-none" aria-label="pid" />
              <span>PID: {{ p.pid }}</span>
            </div>
            <div class="flex gap-1 flex-none">
              <i-mdi:server-network aria-label="hostname" class="flex-none" />
              <span>{{ p.hostname }} </span>
            </div>
          </div>
        </va-list-item-label>
      </va-list-item-section>

      <!-- start time and task id -->
      <va-list-item-section class="flex-none px-3">
        <va-list-item-label>
          <div>
            <va-popover message="Started On" :hover-over-timeout="500">
              <i-mdi-calendar
                class="inline-block text-slate-700 dark:text-slate-300"
              />
            </va-popover>
            <span class="pl-2 spacing-wider">
              {{ datetime.absolute(p.start_time) }}
            </span>
          </div>
        </va-list-item-label>
        <va-list-item-label caption>
          <span class="font-semibold"> Task ID: </span>

          <span>
            {{ p.task_id }}
          </span></va-list-item-label
        >
      </va-list-item-section>

      <!-- logs icon and modal link -->
      <va-list-item-section icon>
        <div
          class="flex gap-1 va-link hover:underline"
          @click="emit('showLogs', p.id)"
        >
          <Icon icon="vscode-icons:file-type-log" class="text-2xl flex-none" />
          <span class="">Logs</span>
        </div>
      </va-list-item-section>
    </va-list-item>
  </va-list>
</template>

<script setup>
import workflowService from "@/services/workflow";
import * as datetime from "@/services/datetime";

const props = defineProps({
  workflowId: {
    type: String,
    required: true,
  },
  stepName: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["showLogs"]);

// const process_groups = ref({});
const processes = ref([]);

workflowService
  .getWorkflowProcesses({
    workflow_id: props.workflowId,
    step: props.stepName,
  })
  .then((res) => {
    // process_groups.value = groupBy("task_id")(res.data || []);
    processes.value = res.data || [];
  })
  .catch((err) => {
    console.error(err);
  });
</script>
