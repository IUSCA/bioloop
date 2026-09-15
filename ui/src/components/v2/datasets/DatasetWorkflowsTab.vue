<template>
  <div class="space-y-3">
    <div
      v-if="loading"
      class="text-center py-8 text-sm text-gray-500 dark:text-gray-400"
    >
      Loading workflows...
    </div>

    <div v-else-if="error" class="py-8">
      <ErrorState title="Failed to load workflows" :message="error" />
    </div>

    <div v-else-if="runs.length === 0" class="py-8">
      <EmptyState
        title="No workflows"
        message="Nothing has run against this dataset yet."
        :show-clear-filters="false"
      />
    </div>

    <div v-else class="space-y-2">
      <Collapsible
        v-for="run in runs"
        :key="run.id"
        v-model="run.collapse_model"
      >
        <template #header-content>
          <WorkflowCompact :workflow="run" />
        </template>

        <div class="mt-2">
          <!-- Its own action bar is hidden: it posts to the legacy workflow routes, which
               authorize on the workflow alone and offer a delete this tab does not. Its
               refetch is off for the same reason: the run above already carries its task
               runs, and the legacy read refuses callers who hold only dataset access. -->
          <Workflow :workflow="run" :show-actions="false" :fetch="false" />

          <!-- Acting on a run needs the same authority as starting one, so the buttons
               appear only for callers who could launch this workflow. Oversight sees the
               tab read-only. -->
          <div v-if="props.canAct" class="flex justify-end gap-3 mt-3">
            <VaButton
              v-if="isResumable(run)"
              preset="secondary"
              icon="mdi-play"
              :loading="acting === run.id"
              @click="control(run, 'resume')"
            >
              Resume
            </VaButton>

            <VaButton
              v-if="isRunning(run)"
              preset="secondary"
              color="danger"
              icon="mdi-stop-circle-outline"
              :loading="acting === run.id"
              @click="control(run, 'pause')"
            >
              Stop
            </VaButton>
          </div>
        </div>
      </Collapsible>
    </div>
  </div>
</template>

<script setup>
import datasetService from "@/services/v2/datasets";
import toast from "@/services/toast";

const props = defineProps({
  dataset: { type: Object, required: true },
  // Whether the viewer may stop or resume a run. Oversight can open this tab and cannot act.
  canAct: { type: Boolean, default: false },
});

const emit = defineEmits(["count-changed"]);

const runs = ref([]);
const loading = ref(false);
const error = ref(null);
const acting = ref(null);

// A run that ended badly can be started again; one still going can be stopped. Matches the
// states the legacy workflow view offers each action in.
const DONE = ["SUCCESS", "FAILURE", "REVOKED"];
const isResumable = (run) => ["REVOKED", "FAILURE"].includes(run.status);
const isRunning = (run) => !DONE.includes(run.status);

async function fetchRuns() {
  loading.value = true;
  error.value = null;

  try {
    const { data } = await datasetService.listWorkflows(
      props.dataset.resource_id,
      { last_task_run: true, prev_task_runs: true },
    );
    runs.value = (data || []).map((run) => ({
      ...run,
      // Open the ones still going, so the tab lands on what needs attention.
      collapse_model: !DONE.includes(run.status),
    }));
    emit("count-changed", runs.value.length);
  } catch (err) {
    error.value = "Unable to load workflows for this dataset.";
    console.error(err);
  } finally {
    loading.value = false;
  }
}

async function control(run, verb) {
  acting.value = run.id;
  try {
    await datasetService.controlWorkflow({
      id: props.dataset.resource_id,
      workflow_id: run.id,
      verb,
    });
    toast.success(verb === "resume" ? "Workflow resumed" : "Workflow stopped");
    await fetchRuns();
  } catch (err) {
    console.error(err);
    toast.error(
      verb === "resume"
        ? "Unable to resume workflow"
        : "Unable to stop workflow",
    );
  } finally {
    acting.value = null;
  }
}

onMounted(fetchRuns);
watch(() => props.dataset?.resource_id, fetchRuns);

defineExpose({ refresh: fetchRuns });
</script>
