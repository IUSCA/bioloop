<template>
  <va-modal
    v-model="visible"
    title="Edit Project"
    no-outside-dismiss
    fixed-layout
    hide-default-actions
    size="small"
  >
    <va-inner-loading
      :loading="loading"
      class="sm:min-h-[50vh] sm:max-h-[50vh] min-h-[65vh] max-h-[65vh]"
    >
      <ProjectInfoForm />
    </va-inner-loading>
    <template #footer>
      <div class="flex w-full justify-center gap-5">
        <va-button preset="secondary" class="flex-none" @click="hide">
          Cancel
        </va-button>
        <va-button
          class="flex-none"
          @click="handleEdit"
          :disabled="!projectFormStore.form.isValid"
        >
          Edit
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import projectService from "@/services/projects";
import { useProjectFormStore } from "@/stores/projects/projectForm";

const props = defineProps(["id"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

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

function handleEdit() {
  projectFormStore.form.validate();
  if (projectFormStore.form.isValid) {
    loading.value = true;
    const project_data = projectFormStore.project_info;

    projectService.modifyProject({ id: props.id, project_data }).finally(() => {
      loading.value = false;
      emit("update");
      hide();
    });
  }
}
</script>
