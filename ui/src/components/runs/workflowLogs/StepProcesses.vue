<template>
  <va-list>
    <va-list-item v-for="p in processes" :key="p.id" class="space-y-1">
      <va-list-item-section>
        <va-list-item-label>
          <span class="va-text-code" style="color: var(--va-text-primary)">
            $ {{ p.tags?.args?.join(" ") }}
          </span>
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

      <va-list-item-section>
        <va-list-item-label>
          <span class="spacing-wider" style="color: var(--va-text-primary)">
            {{ datetime.absolute(p.start_time) }}
          </span>
        </va-list-item-label>
        <va-list-item-label caption>Start Time</va-list-item-label>
      </va-list-item-section>

      <va-list-item-section>
        <va-list-item-label>
          <span style="color: var(--va-text-primary)">
            {{ p.task_id }}
          </span>
        </va-list-item-label>
        <va-list-item-label caption>Task ID</va-list-item-label>
      </va-list-item-section>

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
