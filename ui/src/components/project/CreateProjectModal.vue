<template>
  <va-modal
    class="createproject"
    v-model="visible"
    title="Create a New Project"
    fixed-layout
    hide-default-actions
  >
    <va-inner-loading :loading="loading">
      <div class="h-[calc(80vh)] w-full"></div>
    </va-inner-loading>
    <template #footer>
      <div class="flex w-full justify-center gap-5">
        <va-button preset="secondary" class="flex-none" @click="hide">
          Cancel
        </va-button>
        <va-button
          class="flex-none"
          @click="handleCreate"
          :disabled="!projectFormStore.form.isValid"
        >
          Create
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import { useProjectFormStore } from "@/stores/projects/projectForm";
// import { useToastStore } from "@/stores/toast";
import projectService from "@/services/projects";

const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

// const toast = useToastStore();
const projectFormStore = useProjectFormStore();

const loading = ref(false);
const visible = ref(false);

function hide() {
  loading.value = false;
  visible.value = false;
  projectFormStore.$reset();
}

function show() {
  visible.value = true;
}

function handleCreate() {
  projectFormStore.form.validate();
  if (projectFormStore.form.isValid) {
    loading.value = true;

    const user_ids = projectFormStore.user_ids;
    const project_data = projectFormStore.project_info;
    const dataset_ids = projectFormStore.dataset_ids;

    projectService
      .createProject({
        project_data,
        user_ids,
        dataset_ids,
      })
      // .then((res) => {
      //   debugger;
      //   toast.success(`Created project: ${res.data?.name}`);
      // })
      // .catch((err) => {
      //   console.error(err);
      // toast.error("Failed to create project");
      // })
      .finally(() => {
        loading.value = false;
        emit("update");
        hide();
      });
  }
}
</script>

<style lang="scss">
.createproject {
  // --va-modal-width: calc(30vw);
}
</style>
