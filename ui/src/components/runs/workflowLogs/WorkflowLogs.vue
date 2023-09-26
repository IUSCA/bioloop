<template>
  <div class="">
    <!-- filter and options -->
    <div class="flex flex-wrap gap-3 mb-3 items-center">
      <!-- search bar -->
      <va-input
        v-model="filterText"
        class="w-full lg:w-[50%]"
        placeholder="Type / to begin search"
        outline
        clearable
        input-class="search-input"
      >
        <template #prependInner>
          <Icon icon="material-symbols:search" class="text-xl" />
        </template>
      </va-input>

      <!-- checkboxes -->
      <va-checkbox v-model="show_timestamps" class="" label="Timestamps" />
    </div>

    <!-- table -->
    <!-- 
        virtual-scroller is not working because wrapped text changes the row height. 
        scrolling is jerky and buggy when row heigh is not uniform.
    -->
    <!-- 
        explicit table height is required for the scroll jump component,
        34.5rem is chosen because it is the height of a vuestic modal in my screen excluding
        the modal header and the filters
    -->

    <va-data-table
      :items="rows"
      :columns="columns"
      clickable
      :row-bind="getRowBind"
      :scroll-bottom-margin="5"
      @row:click="onClick"
      sticky-header
      sticky-footer
      style="height: 34.5rem"
      class="log-table"
      ref="tableRef"
    >
      <template #cell(level)="{ source }">
        <span class="uppercase text-sm"> {{ source }} </span>
      </template>

      <template #cell(message)="{ source }">
        <!-- max width is needed to wrap long text -->
        <pre
          class="text-xs max-w-[830px]"
          style="white-space: pre-wrap; word-wrap: break-word"
          >{{ source }}</pre
        >
      </template>

      <template #cell(timestamp)="{ source }">
        <span class="spacing-wide text-sm">
          {{ datetime.absolute(source, false) }}
        </span>
      </template>
    </va-data-table>

    <!-- anchor div to position the scroll jump button absolutely -->
    <div>
      <!-- scroll to bottom and back to top -->
      <div class="absolute right-10 top-[37rem]">
        <ScrollJump
          :elem-ref="tableRef"
          :items-in-view="ROWS_IN_VIEW"
          :num-items="rows.length"
          :total-items="logSize"
          :key="tableRef"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import useSearchKeyShortcut from "@/composables/useSearchKeyShortcut";
import workflowService from "@/services/workflow";
import { useToastStore } from "@/stores/toast";
import * as datetime from "@/services/datetime";

useSearchKeyShortcut();

const toast = useToastStore();
const { copy } = useClipboard();

const props = defineProps({
  processId: {
    type: Number,
    required: true,
  },
  live: {
    type: Boolean,
    default: true,
  },
});

const ROWS_IN_VIEW = 19;

const logs = ref([]);
const show_timestamps = ref(false);
const tableRef = ref(null);
const filterText = ref("");

const columns = computed(() => {
  const cols = [
    // { key: "id" },
    { key: "level", width: "72px" },
    { key: "message" },
  ];
  if (show_timestamps.value) {
    // add timestamp colum to the front of the cols array
    cols.unshift({ key: "timestamp", width: "150px" });
  }
  return cols;
});

const rows = computed(() => {
  return logs.value.filter(
    (log) =>
      log.message.toLowerCase().includes(filterText.value.toLowerCase()) ||
      log.level.toLowerCase().includes(filterText.value.toLowerCase()),
  );
});

const logSize = computed(() => logs.value.length);

function fetchLogs({ afterId = null } = {}) {
  return workflowService
    .getLogs({
      processId: props.processId,
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
  if (row.level === "stderr") {
    rowClasees.push(["text-red-600"]);
  }
  return { class: rowClasees };
}

const { pause, resume } = useIntervalFn(() => {
  const lastId = logSize.value > 0 ? logs.value[logSize.value - 1].id : null;
  fetchLogs({ afterId: lastId });
}, 5000);

// start or stop timer by reacting to live_updates value
watch(
  () => props.live,
  (value) => {
    if (value) {
      resume();
    } else {
      pause();
    }
  },
  {
    immediate: true,
  },
);

fetchLogs();
</script>

<style lang="scss" scoped>
.log-table {
  --va-data-table-cell-padding: 1px;
}
</style>
