<template>
  <va-modal
    data-testid="merge-projects-modal"
    v-model="visible"
    title="Merge Projects"
    fixed-layout
    hide-default-actions
    no-outside-dismiss
  >
    <va-inner-loading :loading="loading">
      <div class="sm:min-w-[600px] sm:max-h-[65vh] sm:min-h-[50vh]">
        <div class="space-y-4">
          <span>
            Combine datasets from selected projects into the current project
          </span>

          <ProjectSelect :exclude-ids="[props.id]" @select="add_project" />

          <ProjectList
            :projects="Object.values(selected)"
            show-remove
            @remove="remove_project"
          />
        </div>
      </div>
    </va-inner-loading>
    <template #footer>
      <div class="flex flex-col w-full">
        <va-checkbox
          v-model="delete_merged"
          class="mb-6"
          label="Delete selected projects after merging"
        />
        <div v-if="delete_merged">
          <span class=""></span>
        </div>
        <va-divider />
      </div>

      <div class="flex w-full justify-center gap-5">
        <va-button preset="secondary" class="flex-none" @click="hide">
          Cancel
        </va-button>
        <va-button
          class="flex-none"
          @click="handleMerge"
          :color="delete_merged ? 'danger' : 'primary'"
          :disabled="target_project_ids.length == 0"
        >
          <span v-if="delete_merged">
            Merge and Delete ({{ target_project_ids.length }})</span
          >
          <span v-else> Merge </span>
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import projectService from "@/services/projects";

const props = defineProps(["id"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const loading = ref(false);
const visible = ref(false);
const selected = ref({});
const delete_merged = ref(false);

const target_project_ids = computed(() => {
  return Object.keys(selected.value);
});

function hide() {
  loading.value = false;
  visible.value = false;
  selected.value = {};
  delete_merged.value = false;
}

function show() {
  visible.value = true;
}

function add_project(p) {
  selected.value[p.id] = p;
}

function remove_project(p) {
  delete selected.value[p.id];
}

function handleMerge() {
  if (target_project_ids.value.length > 0) {
    loading.value = true;
    projectService
      .mergeProjects({
        src_project_id: props.id,
        target_project_ids: target_project_ids.value,
        delete_merged: delete_merged.value,
      })
      .finally(() => {
        loading.value = false;
        emit("update");
        hide();
      });
  }
}
</script>
