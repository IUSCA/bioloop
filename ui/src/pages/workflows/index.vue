<template>
  <div class="flex flex-col gap-3 md:flex-row">
    <!-- filters -->
    <div
      class="md:w-1/6 md:border-solid md:border-r md:h-screen md:min-w-[130px]"
      style="border-color: var(--va-background-border)"
    >
      <!-- reset -->
      <div class="text-right px-3">
        <button class="va-link text-center" @click="reset_query_params">
          Reset
        </button>
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
          @change="search_text = ''"
        />
      </div>

      <!-- failure modes -->
      <div v-if="Object.keys(failure_modes).length">
        <va-divider />

        <!-- failure modes -->
        <div class="text-lg font-semibold hidden md:block md:pb-2">
          Failure Modes
          <span class="text-sm va-text-secondary ml-1 font-thin">
            in this page
          </span>
        </div>
        <!-- show failure modes -->
        <div class="flex gap-1">
          <va-tabs
            v-model="query_params.failure_mode"
            :vertical="!breakpoint_sm"
            class="md:min-h-[100px]"
          >
            <template #tabs>
              <va-tab
                v-for="fm in Object.keys(failure_modes)"
                :key="fm"
                :name="fm"
              >
                <span class="text-base font-normal">
                  {{ fm }} ({{ failure_modes[fm] }})
                </span>
              </va-tab>
            </template>
          </va-tabs>
        </div>
      </div>
    </div>

    <!-- workflows -->
    <div class="md:w-5/6">
      <!-- filters container -->
      <div class="flex flex-row gap-2">
        <!-- Search filters     -->
        <WorkflowSearchInputFilter
          v-model:search_by="query_params.search_by"
          v-model:search_text="query_params.search_text"
        />
      </div>

      <!-- loading -->
      <div :class="{ invisible: !loading }" class="">
        <va-progress-bar indeterminate size="0.25rem" :rounded="false" />
      </div>

      <collapsible
        v-for="workflow in filtered_workflows"
        :key="workflow.id"
        v-model="workflow.collapse"
      >
        <template #header-content>
          <div class="flex-[0_0_90%]">
            <workflowCompact
              :workflow="workflow"
              :show_dataset="!!workflow.dataset_id"
            />
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
      <Pagination
        class="mt-5 px-1 lg:px-3"
        v-if="query_params.failure_mode == null"
        v-model:page="query_params.page"
        v-model:page_size="query_params.page_size"
        :total_results="total_results"
        :curr_items="workflows.length"
        :page_size_options="PAGE_SIZE_OPTIONS"
      />
    </div>
  </div>
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import toast from "@/services/toast";
import workflowService from "@/services/workflow";
import { useNavStore } from "@/stores/nav";
import { useBreakpoint } from "vuestic-ui";

const nav = useNavStore();
const breakpoint = useBreakpoint();

nav.setNavItems([
  {
    label: "Workflows",
  },
]);

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const default_query_params = () => ({
  status: null,
  page: 1,
  auto_refresh: 10,
  failure_mode: null,
  page_size: 10,
  search_by: "dataset_name",
  search_text: "",
});
const auto_refresh_options = [
  { valueBy: 0, text: "Off" },
  { valueBy: 5, text: "5s" },
  { valueBy: 10, text: "10s" },
  { valueBy: 15, text: "15s" },
  { valueBy: 30, text: "30s" },
  { valueBy: 60, text: "1m" },
];

const loading = ref(false);
const workflows = ref([]);
const total_results = ref(0);
const status_counts = ref({});

const query_params = ref(default_query_params());
useQueryPersistence({
  refObject: query_params,
  defaultValueFn: default_query_params,
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

const skip = computed(() => {
  return query_params.value.page_size * (query_params.value.page - 1);
});

const failure_modes = computed(() => {
  return compute_failure_modes(workflows.value);
});

const filtered_workflows = computed(() => {
  return workflows.value.filter((wf) => {
    if (!query_params.value.failure_mode) {
      return true;
    }
    return get_failure_mode(wf) === query_params.value.failure_mode;
  });
});

const getData = useThrottleFn(function () {
  loading.value = true;

  // remove loading when all promises are settled
  return Promise.allSettled([getWorkflows(), getCounts()]).then(() => {
    loading.value = false;
  });
}, 500);

// fetch data when query params change
watch(
  [
    () => query_params.value.status,
    () => query_params.value.page,
    () => query_params.value.page_size,
  ],
  (newVals, oldVals) => {
    // set page to 1 when page_size changes
    // on initial load, page_size is null, do not reset page
    if (oldVals[2] != null && newVals[2] !== oldVals[2]) {
      query_params.value.page = 1;
    }

    getData().then(() => {
      // remove failure mode selection when user selects a status or changes
      // page
      query_params.value.failure_mode = null;
    });
  },
  {
    deep: true,
    immediate: true,
  },
);

// fetch data when search text changes
// reset page to 1
watchDebounced(
  () => query_params.value.search_text,
  () => {
    query_params.value.page = 1;
    getData();
  },
  {
    immediate: false,
    debounce: 500,
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
  const search_params = {
    last_task_run: true,
    status: query_params.value.status,
    skip: skip.value,
    limit: query_params.value.page_size,
    initiator: true,
    ...(query_params.value.search_text.trim() !== "" && {
      [query_params.value.search_by]: query_params.value.search_text,
    }),
  };

  return workflowService
    .getAll(search_params)
    .then((res) => {
      // keep workflows open that were open
      workflows.value = (res.data?.results || []).map((w, i) => {
        return {
          ...w,
          collapse: workflows.value[i]?.collapse || false,
        };
      });
      total_results.value =
        res.data?.metadata?.total || workflows.value?.length || 0;
    })
    .catch((err) => {
      toast.error("Failed to fetch workflows");
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

function reset_query_params() {
  query_params.value = default_query_params();
}

function get_failure_mode(wf) {
  const failed_step = (wf?.steps || []).filter(
    (step) => step.status === "FAILURE",
  )[0];
  const failure_mode = failed_step?.last_task_run?.result?.exc_type;
  return failure_mode;
}

function compute_failure_modes(workflows) {
  return workflows
    .filter((wf) => wf.status === "FAILURE")
    .reduce((acc, wf) => {
      const failure_mode = get_failure_mode(wf);
      if (failure_mode) {
        acc[failure_mode] = (acc[failure_mode] || 0) + 1;
      }
      return acc;
    }, {});
}
</script>

<!-- making this style scoped does not seem to apply this style to the select component -->
<style>
.auto-refresh-select fieldset.va-input-wrapper__size-keeper {
  width: 100%;
}
</style>

<route lang="yaml">
meta:
  title: Workflows
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Workflows" }]
</route>
