<template>
  <div v-if="failed_task_run">
    <div
      class="bg-red-100 border dark:bg-red-900 text-red-700 dark:text-red-100 px-4 py-3 rounded relative"
      role="alert"
    >
      <strong class="font-bold">{{ failed_task_run.result.exc_type }}</strong>
      <ul class="list-disc pl-5">
        <li
          v-for="(message, index) in failed_task_run.result.exc_message"
          :key="index"
        >
          {{ message[0] }}: {{ message[1] }}
        </li>
      </ul>

      <!-- toggle traceback button -->
      <button
        @click="showTraceback = !showTraceback"
        class="absolute top-0 bottom-0 right-0 px-4 py-3 focus:outline-none text-red-700 dark:text-red-100"
      >
        {{ showTraceback ? "Hide" : "Show" }} Traceback
      </button>
    </div>

    <div v-if="showTraceback" class="mt-2">
      <div
        class="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 px-4 py-2 rounded text-xs max-h-[300px] overflow-scroll"
      >
        <pre class="whitespace-pre-wrap">{{ failed_task_run.traceback }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  workflow: {
    type: Object,
    required: true,
  },
});

const wf = ref(null);
const showTraceback = ref(false);

watch(
  () => props.workflow,
  (workflow) => {
    wf.value = workflow;
  },
  { immediate: true },
);

const failed_task_run = computed(() => {
  if (wf.value?.status === "FAILURE") {
    const failed_step = (wf.value?.steps || []).filter(
      (s) => s.status === "FAILURE",
    )[0];
    console.log("failed_step", failed_step);
    if (failed_step) {
      return failed_step.last_task_run;
    }
  }
});
</script>
