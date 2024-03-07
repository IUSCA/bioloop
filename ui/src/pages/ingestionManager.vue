<template>
  <!--  <div class="flex flex-col gap-3 md:flex-row">-->
  <!--    &lt;!&ndash; filters &ndash;&gt;-->
  <!--    <div-->
  <!--      class="md:w-1/6 md:border-solid md:border-r md:h-screen md:min-w-[130px]"-->
  <!--      style="border-color: var(&#45;&#45;va-background-border)"-->
  <!--    >-->
  <!--      &lt;!&ndash; reset &ndash;&gt;-->
  <!--      <div class="text-right px-3">-->
  <!--        <button class="va-link text-center" @click="reset_query_params">-->
  <!--          Reset-->
  <!--        </button>-->
  <!--      </div>-->

  <!--      &lt;!&ndash; status filters &ndash;&gt;-->
  <!--      <div class="text-lg font-semibold hidden md:block">Status</div>-->
  <!--      &lt;!&ndash; reset page when user selects a new filter &ndash;&gt;-->

  <!--      &lt;!&ndash;      <va-tabs&ndash;&gt;-->
  <!--      &lt;!&ndash;        v-model="query_params.status"&ndash;&gt;-->
  <!--      &lt;!&ndash;        :vertical="!breakpoint_sm"&ndash;&gt;-->
  <!--      &lt;!&ndash;        @update:model-value="query_params.page = 1"&ndash;&gt;-->
  <!--      &lt;!&ndash;        class="md:min-h-[164px]"&ndash;&gt;-->
  <!--      &lt;!&ndash;      >&ndash;&gt;-->
  <!--      &lt;!&ndash;        <template #tabs>&ndash;&gt;-->
  <!--      &lt;!&ndash;          <va-tab&ndash;&gt;-->
  <!--      &lt;!&ndash;            v-for="status in Object.keys(status_counts)"&ndash;&gt;-->
  <!--      &lt;!&ndash;            :key="status"&ndash;&gt;-->
  <!--      &lt;!&ndash;            :name="status"&ndash;&gt;-->
  <!--      &lt;!&ndash;          >&ndash;&gt;-->
  <!--      &lt;!&ndash;            <span class="text-base font-normal">&ndash;&gt;-->
  <!--      &lt;!&ndash;&lt;!&ndash;              {{ status }} ({{ status_counts[status] }})&ndash;&gt;&ndash;&gt;-->
  <!--      &lt;!&ndash;            </span>&ndash;&gt;-->
  <!--      &lt;!&ndash;          </va-tab>&ndash;&gt;-->
  <!--      &lt;!&ndash;        </template>&ndash;&gt;-->
  <!--      &lt;!&ndash;      </va-tabs>&ndash;&gt;-->

  <!--      <va-divider />-->
  <!--    </div>-->

  <!--    <div class="md:w-5/6 space-y-2">-->
  <!--      <collapsible-->
  <!--        v-for="item in actionItems"-->
  <!--        :key="item.id"-->
  <!--        v-model="item.collapse"-->
  <!--      >-->
  <!--        <template #header-content>-->
  <!--          <div class="flex-[0_0_90%]">-->
  <!--            <div-->
  <!--              class="grid grid-cols-6 lg:grid-cols-12 gap-1 lg:gap-3 items-center p-1"-->
  <!--            >-->
  <!--              <div-->
  <!--                class="col-span-2 lg:col-span-6 flex flex-nowrap items-center gap-3 lg:gap-5"-->
  <!--              >-->
  <!--                <div class="flex-none md:mx-2">-->
  <!--                  <i-mdi-check-circle-->
  <!--                    style="color: var(&#45;&#45;va-success)"-->
  <!--                    class="text-xl"-->
  <!--                  ></i-mdi-check-circle>-->
  <!--                </div>-->

  <!--                <div class="flex flex-col">-->
  <!--                  <span class="text-lg font-semibold capitalize">-->
  <!--                    {{ item.label }}-->
  <!--                  </span>-->

  <!--                  <div class="flex gap-2 text-sm">-->
  <!--                    <div>-->
  <!--                      Original dataset:-->
  <!--                      <router-link-->
  <!--                        :to="`/datasets/${item.dataset_id}`"-->
  <!--                        class="va-link"-->
  <!--                        >#{{ item.dataset_id }}</router-link-->
  <!--                      >-->
  <!--                    </div>-->
  <!--                    <div>-->
  <!--                      Duplicate dataset:-->
  <!--                      <router-link-->
  <!--                        :to="`/datasets/${item.duplicate_dataset_id}`"-->
  <!--                        class="va-link"-->
  <!--                        >#{{ item.duplicate_dataset_id }}</router-link-->
  <!--                      >-->
  <!--                    </div>-->
  <!--                  </div>-->
  <!--                </div>-->
  <!--              </div>-->

  <!--              &lt;!&ndash; created at &ndash;&gt;-->
  <!--              <div class="col-span-2 lg:col-span-3">-->
  <!--                <va-popover message="Ingested On" :hover-over-timeout="500">-->
  <!--                  <i-mdi-calendar-->
  <!--                    class="text-xl inline-block text-slate-700 dark:text-slate-300"-->
  <!--                  />-->
  <!--                </va-popover>-->
  <!--                <span-->
  <!--                  class="hidden md:inline pl-2 lg:spacing-wider text-sm lg:text-base"-->
  <!--                >-->
  <!--                  {{ datetime.absolute(item.created_at) }}-->
  <!--                </span>-->
  <!--                <span-->
  <!--                  class="md:hidden pl-2 lg:spacing-wider text-sm lg:text-base"-->
  <!--                >-->
  <!--                  {{ datetime.date(item.created_at) }}-->
  <!--                </span>-->
  <!--              </div>-->
  <!--            </div>-->
  <!--          </div>-->
  <!--        </template>-->

  <!--        &lt;!&ndash; Details of Ingestion &ndash;&gt;-->
  <!--        <div>-->
  <!--          <va-data-table-->
  <!--            :columns="columns"-->
  <!--            :data="getActionItemRows(item)"-->
  <!--          ></va-data-table>-->
  <!--        </div>-->
  <!--      </collapsible>-->
  <!--    </div>-->
  <!--  </div>-->

  <div>
    <va-data-table
      :columns="columns"
      :items="getActionItemRows()"
    ></va-data-table>
  </div>

  <!-- pagination -->
  <!--  <Pagination-->
  <!--    class="mt-5 px-1 lg:px-3"-->
  <!--    v-if="query_params.failure_mode == null"-->
  <!--    v-model:page="query_params.page"-->
  <!--    v-model:page_size="query_params.page_size"-->
  <!--    :total_results="total_results"-->
  <!--    :curr_items="workflows.length"-->
  <!--    :page_size_options="PAGE_SIZE_OPTIONS"-->
  <!--  />-->
</template>

<script setup>
import actionItemService from "@/services/ingestion";
import toast from "@/services/toast";
import useQueryPersistence from "@/composables/useQueryPersistence";
import * as datetime from "@/services/datetime";

const getActionItemRows = (item) => {
  return [{ check: "check1", passed: "check1" }];
  // return item.metadata.checks.map((check) => {
  //   return {
  //     name: check.name,
  //     passed: check.passed,
  //   };
  // });
};

const columns = [{ key: "check" }, { key: "passed" }];

const loading = ref(false);
const actionItems = ref([]);

const fetchActiveActionItems = () => {
  loading.value = true;
  return actionItemService
    .getActionItems({
      type: "DUPLICATE_INGESTION",
      active: true,
    })
    .then((res) => {
      actionItems.value = res.data.map((item) => {
        return {
          ...item,
          duplicate_dataset_id: item.metadata.duplicate_dataset_id,
        };
      });
    })
    .catch((err) => {
      toast.error("Could not fetch action items");
      console.log(err);
    })
    .finally(() => {
      loading.value = false;
    });
};

// onMounted(() => {
//   fetchActiveActionItems();
// });

const default_query_params = () => ({
  status: null,
  page: 1,
  auto_refresh: 10,
  failure_mode: null,
  page_size: 10,
});

const query_params = ref(default_query_params());
useQueryPersistence({
  refObject: query_params,
  defaultValue: default_query_params(),
  key: "wq",
  history_push: false,
});

const group_counts = computed(() => {
  // const counts = status_counts.value;
  return {
    ACTIVE: 0,
    RESOLVED: 0,
  };
});

const breakpoint_sm = computed(() => {
  return breakpoint.width < 768;
});

const skip = computed(() => {
  return query_params.value.page_size * (query_params.value.page - 1);
});

const failure_modes = computed(() => {
  return [];
});

const filtered_action_items = computed(() => {
  return [];
});

// fetch data when query params change
watch(
  [
    () => query_params.value.status,
    () => query_params.value.page,
    () => query_params.value.page_size,
  ],
  (newVals, oldVals) => {
    // set page to 1 when page_size changes
    if (newVals[2] !== oldVals[2]) {
      query_params.value.page = 1;
    }

    fetchActiveActionItems().then(() => {
      // remove failure mode selection when user selects a status or changes page
      query_params.value.failure_mode = null;
    });
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
  fetchActiveActionItems,
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

function getCounts() {
  return 0;
}

function reset_query_params() {
  query_params.value = default_query_params();
}
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Ingestion Manager
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Ingestion Manager" }]
</route>
