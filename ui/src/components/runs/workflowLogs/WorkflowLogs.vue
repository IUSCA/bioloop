<template>
  <div class="flex gap-3 my-3">
    <va-checkbox v-model="highlight_errors" class="" label="Highlight Errors" />
    <va-checkbox v-model="show_timestamps" class="" label="Show Timestamps" />
    <va-checkbox v-model="live_updates" class="" label="Live Updates" />
  </div>
  <va-data-table
    :items="logs"
    :columns="columns"
    hoverable
    clickable
    :row-bind="getRowBind"
    :scroll-bottom-margin="5"
    @row:click="onClick"
    virtual-scroller
    sticky-header
    sticky-footer
    style="height: 30rem"
    class="p-1 log-table"
    ref="tableRef"
  >
    <template #cell(level)="{ source }">
      <span class="uppercase text-sm"> {{ source }} </span>
    </template>

    <template #cell(message)="{ source }">
      <span class="text-sm"> {{ source }} </span>
    </template>

    <!-- footer -->
    <template #footer>
      <tr class="table-slots">
        <th colspan="12" class="font-normal text-sm py-1">
          <!-- live updates status -->
          <div
            v-if="live_updates"
            class="flex gap-1 items-center justify-end px-2"
          >
            <i-mdi:record class="text-red-600 text-sm flex-none" />
            <i-mdi-refresh class="flex-none" />
            <span class="flex-none va-text-secondary"
              >live updates enabled</span
            >
          </div>

          <!-- scroll to bottom and back to top -->
          <div class="absolute right-6 -top-12">
            <ScrollJump
              :elem-ref="tableRef"
              :items-in-view="ROWS_IN_VIEW"
              :num-items="logSize"
              :key="tableRef"
            />
          </div>
        </th>
      </tr>
    </template>
  </va-data-table>
  <va-backtop />
</template>

<script setup>
import workflowService from "@/services/workflow";
import { useToastStore } from "@/stores/toast";

const toast = useToastStore();
const { copy } = useClipboard();

const props = defineProps({
  workflowId: {
    type: String,
    required: true,
  },
});

const step = "test_step";
const ROWS_IN_VIEW = 15;

const logs = ref([]);
const highlight_errors = ref(true);
const show_timestamps = ref(false);
const live_updates = ref(false);
const tableRef = ref(null);

const columns = computed(() => {
  const cols = [
    // { key: "id" },
    { key: "level", width: "72px" },
    { key: "message" },
  ];
  if (show_timestamps.value) {
    cols.unshift({ key: "timestamp", width: "200px" });
  }
  return cols;
});

const logSize = computed(() => logs.value.length);

function fetchLogs({ afterId = null } = {}) {
  return workflowService
    .getWorkflowLogs({
      workflowId: props.workflowId,
      step,
      afterId,
    })
    .then((res) => {
      logs.value.push(...(res.data || []));
    })
    .catch((err) => {
      toast.error("Unable to fetch workflow logs");
      console.error(err);
    });
}

function onClick(event) {
  const row = event.item;
  copy(row.message);
}

function getRowBind(row) {
  const rowClasees = [];
  if (highlight_errors.value && row.level === "stderr") {
    rowClasees.push(["bg-red-100"]);
  }
  return { class: rowClasees };
}

const { pause, resume } = useIntervalFn(() => {
  const lastId = logSize.value > 0 ? logs.value[logSize.value - 1].id : null;
  fetchLogs({ afterId: lastId });
}, 5000);

watch(
  live_updates,
  (value) => {
    if (value) {
      resume();
    } else {
      pause();
    }
  },
  {
    immediate: true,
  }
);

fetchLogs();
</script>

<style lang="scss" scoped>
.log-table {
  --va-data-table-cell-padding: 3px;
}
</style>
