<template>
  <div class="flex flex-col gap-3 md:flex-row">
    <!-- filters -->
    <div
      class="md:w-1/6 md:border-solid md:border-r md:h-screen md:min-w-[130px]"
      style="border-color: var(--va-background-border)"
    >
      <!-- reset -->
      <div class="text-right px-3">
        <span class="va-link text-center" @click="reset_query_params">
          Reset
        </span>
      </div>

      <!-- status filters -->
      <div class="text-lg font-semibold hidden md:block">Status</div>
      <!-- reset page when user selects a new filter -->

      <va-tabs
        v-model="query_params.status"
        :vertical="!breakpoint_sm"
        @update:model-value="query_params.page = 1"
        class="md:min-h-[164px]"
      >
        <template #tabs>
          <va-tab
            v-for="status in Object.keys(status_counts)"
            :key="status"
            :name="status"
          >
            <span class="text-base font-normal">
              {{ status }} ({{ status_counts[status] }})
            </span>
          </va-tab>
        </template>
      </va-tabs>

      <va-divider />

      <!-- group filters -->
      <div class="text-lg font-semibold hidden md:block">Status Group</div>

      <va-tabs
        v-model="query_params.status"
        :vertical="!breakpoint_sm"
        class="md:min-h-[100px]"
      >
        <template #tabs>
          <va-tab
            v-for="status in Object.keys(group_counts)"
            :key="status"
            :name="status"
          >
            <span class="text-base font-normal">
              {{ status }} ({{ group_counts[status] }})
            </span>
          </va-tab>
        </template>
      </va-tabs>

      <va-divider />

      <!-- <div>
        <span>Sort By</span>
      </div>
      <div>
        <span>Sort Order</span>
      </div>

      <va-divider /> -->

      <!-- auto refresh -->
      <div class="text-lg font-semibold hidden md:block md:pb-2">
        Auto Refresh
      </div>
      <div class="flex gap-1">
        <va-button preset="primary" @click="getData" class="max-w-[120px]">
          <div class="flex justify-between gap-1">
            <i-mdi:refresh class="text-lg" />
          </div>
        </va-button>

        <va-select
          class="auto-refresh-select flex-none"
          width="20px"
          v-model="query_params.auto_refresh"
          :options="auto_refresh_options"
          value-by="valueBy"
        />
      </div>
    </div>

    <!-- workflows -->
    <div class="md:w-5/6 space-y-2">
      <collapsible
        v-for="workflow in workflows"
        :key="workflow.id"
        v-model="workflow.collapse"
      >
        <template #header-content>
          <div class="flex-[0_0_90%]">
            <workflowCompact :workflow="workflow" show_dataset />
          </div>
        </template>

        <div>
          <workflow :workflow="workflow" @update="getData"></workflow>
        </div>
      </collapsible>

      <!-- no results -->
      <div
        v-if="workflows.length === 0"
        class="text-center mt-24 flex flex-col gap-5 justify-center items-center"
      >
        <i-mdi:alert-circle-outline
          style="color: var(--va-info)"
          class="text-4xl"
        />
        <span class="text-lg">
          Sorry, no results found for the selected filters.
        </span>
      </div>

      <!-- pagination -->
      <va-pagination
        v-if="total_pages > 1"
        v-model="query_params.page"
        class="my-3 justify-center"
        :pages="total_pages"
        :visible-pages="5"
      />
    </div>
  </div>
</template>

<script setup>
import workflowService from "@/services/workflow";
import { useNavStore } from "@/stores/nav";
import { useBreakpoint } from "vuestic-ui";
import useQueryPersistence from "@/composables/useQueryPersistence";

const nav = useNavStore();
const breakpoint = useBreakpoint();

nav.setNavItems([
  {
    label: "Workflows",
  },
]);

const PAGE_SIZE = 10;
const default_query_params = () => ({
  status: null,
  page: 1,
  auto_refresh: 10,
});
const auto_refresh_options = [
  { valueBy: 0, text: "Off" },
  { valueBy: 5, text: "5s" },
  { valueBy: 10, text: "10s" },
  { valueBy: 15, text: "15s" },
  { valueBy: 30, text: "30s" },
  { valueBy: 60, text: "1m" },
];

const workflows = ref([]);
const workflows_total_count = ref(0);
const status_counts = ref({});

const query_params = ref(default_query_params());
useQueryPersistence({
  refObject: query_params,
  defaultValue: default_query_params(),
  key: "wq",
  history_push: false,
});

const group_counts = computed(() => {
  const counts = status_counts.value;
  return {
    ACTIVE: counts["PENDING"] + counts["STARTED"],
    DONE: counts["SUCCESS"] + counts["FAILURE"] + counts["REVOKED"],
    EXCEPTION: counts["FAILURE"] + counts["REVOKED"],
  };
});

const breakpoint_sm = computed(() => {
  return breakpoint.width < 768;
});

const total_pages = computed(() => {
  return Math.ceil(workflows_total_count.value / PAGE_SIZE);
});

// fetch data when query params change
watch(
  [() => query_params.value.status, () => query_params.value.page],
  () => {
    getData();
  },
  {
    deep: true,
    immediate: true,
  },
);

const auto_refresh_msec = computed(() => {
  return query_params.value.auto_refresh * 1000;
});

const { pause, resume } = useIntervalFn(
  () => {
    getData();
  },
  auto_refresh_msec,
  {
    immediate: false,
  },
);

// stop interval fn if auto refresh is off (0 seconds)
// restat interval fn if auto refresh is positive
watch(
  () => query_params.value.auto_refresh,
  () => {
    if (query_params.value.auto_refresh) {
      resume();
    } else {
      pause();
    }
  },
  { immediate: true },
);

function getWorkflows() {
  const skip = PAGE_SIZE * (query_params.value.page - 1);
  return workflowService
    .getAll({
      last_task_run: true,
      status: query_params.value.status,
      skip,
      limit: PAGE_SIZE,
    })
    .then((res) => {
      // keep workflows open that were open
      workflows.value = (res.data?.results || []).map((w, i) => {
        return {
          ...w,
          collapse: workflows.value[i]?.collapse || false,
        };
      });
      workflows_total_count.value =
        res.data?.metadata?.total || workflows.value?.length || 0;
    })
    .catch((err) => {
      console.error(err);
    });
}

function getCounts() {
  return workflowService
    .getCountsByStatus()
    .then((res) => {
      status_counts.value = res.data;
    })
    .catch((err) => {
      console.error(err);
    });
}

function getData() {
  getWorkflows();
  getCounts();
}

function reset_query_params() {
  query_params.value = default_query_params();
}
</script>

<route lang="yaml">
meta:
  title: Workflows
  requiresRoles: ["operator", "admin"]
</route>

<!-- making this style scoped does not seem to apply this style to the select component -->
<style>
.auto-refresh-select fieldset.va-input-wrapper__size-keeper {
  width: 100%;
}
</style>
