<template>
  <div class="flex flex-row flex-wrap gap-1">
    <!-- Dataset details -->
    <div class="flex flex-row gap-1 items-center">
      <div class="flex-none">
        <i-mdi-package-variant-closed
          aria-label="dataset"
          class="text-lg text-slate-700 dark:text-slate-300"
        />
      </div>
      <div>
        <div class="text-sm flex gap-1">
          <span class="flex-none"> Working on: </span>
          <router-link
            :to="`/datasets/${props.task.dataset_id}`"
            v-if="props.task.dataset_id"
            class="flex-none w-[180px]"
          >
            <span class="block whitespace-nowrap text-ellipsis overflow-hidden">
              {{ dataset.name || props.task.dataset_id }}
            </span>
          </router-link>
        </div>
        <div class="text-sm">
          <span class=""> Started: </span>
          {{ datetime.fromNow(props.task.date_start) }}
        </div>
      </div>
    </div>

    <!-- Start time and Progress -->
    <div class="flex flex-row gap-1 items-center">
      <div class="flex-none">
        <i-mdi-timer
          aria-label="times"
          class="text-lg text-slate-700 dark:text-slate-300"
        />
      </div>
      <div class="text-sm">
        <div>
          Progress:
          <span v-if="props.task.progress.percent_done">
            {{ props.task.progress.percent_done }}%
          </span>
        </div>
        <div class="min-w-[180px]">
          ETA:
          {{
            datetime.readableDuration(
              props.task.progress.time_remaining_sec * 1000,
            )
          }}
        </div>
      </div>
    </div>

    <!-- Where is the task running -->
    <div class="flex flex-row gap-1 items-center">
      <div class="flex-none">
        <i-mdi-cog
          aria-label="queue and worker"
          class="text-lg text-slate-700 dark:text-slate-300"
        />
      </div>
      <div>
        <div class="text-sm">
          {{ props.task.queue }}
        </div>
        <div
          class="text-xs va-text-secondary min-w-[280px]"
          style="line-height: 0.75rem"
        >
          {{ props.task.worker }}
        </div>
      </div>
    </div>

    <!-- Workflow details -->
    <div class="flex flex-row gap-1 items-center">
      <div class="flex-none">
        <i-mdi:map-marker-path
          aria-label="workflow"
          class="text-lg text-slate-700 dark:text-slate-300"
        />
      </div>
      <div class="min-w-[210px]">
        <div class="text-sm space-x-1">
          <span class="uppercase font-semibold">
            {{ props.task.workflow.name }}
          </span>
          <span class=""> Step #{{ props.task.step_number }} </span>
        </div>
        <div class="va-text-secondary text-xs" style="line-height: 0.75rem">
          {{ props.task.workflow.id }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import datasetService from "@/services/dataset";
import * as datetime from "@/services/datetime";
import { useCacheStore } from "@/stores/cache";

const props = defineProps({
  task: {
    type: Object,
    required: true,
  },
});
const cache = useCacheStore();

const dataset = ref({});

watch(
  () => props.task?.dataset_id,
  () => {
    if (!props.task?.dataset_id) return;
    const _ds = cache.getData(`dataset-${props.task.dataset_id}`);
    if (_ds) {
      dataset.value = _ds;
      return;
    }
    console.log("cache miss, fetching dataset", props.task.dataset_id);
    datasetService
      .getById({
        id: props.task?.dataset_id,
        workflows: false,
      })
      .then((res) => {
        dataset.value = res.data;
        cache.setData(`dataset-${props.task.dataset_id}`, {
          name: res.data.name,
        });
      })
      .catch((err) => {
        console.log(err);
        // no notification
      });
  },
  {
    immediate: true,
  },
);
</script>
