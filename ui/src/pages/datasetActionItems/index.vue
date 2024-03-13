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

      <!--      <va-tabs-->
      <!--        v-model="query_params.status"-->
      <!--        :vertical="!breakpoint_sm"-->
      <!--        @update:model-value="query_params.page = 1"-->
      <!--        class="md:min-h-[164px]"-->
      <!--      >-->
      <!--        <template #tabs>-->
      <!--          <va-tab-->
      <!--            v-for="status in Object.keys(status_counts)"-->
      <!--            :key="status"-->
      <!--            :name="status"-->
      <!--          >-->
      <!--            <span class="text-base font-normal">-->
      <!--              &lt;!&ndash;              {{ status }} ({{ status_counts[status] }})&ndash;&gt;-->
      <!--            </span>-->
      <!--          </va-tab>-->
      <!--        </template>-->
      <!--      </va-tabs>-->

      <va-divider />
    </div>

    <div class="md:w-5/6 space-y-2">
      <action-items :action-items="allActionItems" />
    </div>
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
import datasetService from "@/services/dataset";
import toast from "@/services/toast";
import ActionItems from "@/components/dataset/actionItems/index.vue";

const loading = ref(false);
const allActionItems = ref([]);

const fetchActionItems = () => {
  loading.value = true;
  return datasetService
    .getActionItems({
      type: "DUPLICATE_INGESTION",
      active: true,
    })
    .then((res) => {
      allActionItems.value = res.data.map((item) => {
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

onMounted(() => {
  fetchActionItems();
});

const default_query_params = () => ({
  status: null,
  page: 1,
  auto_refresh: 10,
  failure_mode: null,
  page_size: 10,
});

// const query_params = ref(default_query_params());
// useQueryPersistence({
//   refObject: query_params,
//   defaultValue: default_query_params(),
//   key: "wq",
//   history_push: false,
// });
//
// const group_counts = computed(() => {
//   // const counts = status_counts.value;
//   return {
//     ACTIVE: 0,
//     RESOLVED: 0,
//   };
// });
//
// const breakpoint_sm = computed(() => {
//   return breakpoint.width < 768;
// });
//
// const skip = computed(() => {
//   return query_params.value.page_size * (query_params.value.page - 1);
// });

const failure_modes = computed(() => {
  return [];
});

const filtered_notifications = computed(() => {
  return [];
});

// fetch data when query params change
// watch(
//   [
//     () => query_params.value.status,
//     () => query_params.value.page,
//     () => query_params.value.page_size,
//   ],
//   (newVals, oldVals) => {
//     // set page to 1 when page_size changes
//     if (newVals[2] !== oldVals[2]) {
//       query_params.value.page = 1;
//     }
//
//     fetchActionItems().then(() => {
//       // remove failure mode selection when user selects a status or changes page
//       query_params.value.failure_mode = null;
//     });
//   },
//   {
//     deep: true,
//     immediate: true,
//   },
// );
//
// const auto_refresh_msec = computed(() => {
//   return query_params.value.auto_refresh * 1000;
// });

// const { pause, resume } = useIntervalFn(
//   fetchActionItems,
//   auto_refresh_msec,
//   {
//     immediate: false,
//   },
// );
//
// // stop interval fn if auto refresh is off (0 seconds)
// // restat interval fn if auto refresh is positive
// watch(
//   () => query_params.value.auto_refresh,
//   () => {
//     if (query_params.value.auto_refresh) {
//       resume();
//     } else {
//       pause();
//     }
//   },
//   { immediate: true },
// );

// function getCounts() {
//   return 0;
// }
//
function reset_query_params() {
  // query_params.value = default_query_params();
}
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Manage Duplicate Datasets
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Manage Duplicate Datasets" }]
</route>
