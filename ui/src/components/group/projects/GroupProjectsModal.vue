<template>
  <va-modal
    v-model="visible"
    title="Manage Projects"
    no-outside-dismiss
    fixed-layout
    size="small"
    @ok="handleOk"
    @close="hide"
  >
    <va-inner-loading
      :loading="loading"
      class="sm:min-h-[50vh] sm:max-h-[50vh] min-h-[65vh] max-h-[65vh]"
    >
      <GroupProjectsForm v-model:projects="selectedProjects" />
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import groupService from "@/services/group";
import toast from "@/services/toast";

const props = defineProps({
  groupId: {
    type: String,
    required: true,
  },
  initialProjects: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update"]);

defineExpose({
  show,
  hide,
});

const loading = ref(false);
const visible = ref(false);
const selectedProjects = ref([]);
const persistedProjects = ref([]);

function hide() {
  loading.value = false;
  visible.value = false;
  selectedProjects.value = [];
  persistedProjects.value = [];
}

function show() {
  visible.value = true;
  // Initialize with current projects
  persistedProjects.value = props.initialProjects.map((p) => p.project);
  selectedProjects.value = [...persistedProjects.value];
}

async function handleOk() {
  loading.value = true;
  try {
    // Determine which projects to add and remove
    const persistedIds = persistedProjects.value.map((p) => p.id);
    const selectedIds = selectedProjects.value.map((p) => p.id);

    const add_project_ids = selectedIds.filter((id) => !persistedIds.includes(id));
    const remove_project_ids = persistedIds.filter((id) => !selectedIds.includes(id));

    await groupService.updateProjects(props.groupId, add_project_ids, remove_project_ids);
    toast.success("Projects updated successfully");
    emit("update");
    hide();
  } catch (error) {
    toast.error("Failed to update projects");
  } finally {
    loading.value = false;
  }
}
</script>
