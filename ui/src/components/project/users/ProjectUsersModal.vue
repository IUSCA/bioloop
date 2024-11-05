<template>
  <va-modal
    v-model="visible"
    title="Manage Access"
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
      <ProjectUsersForm />
    </va-inner-loading>
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

function handleOk() {
  const user_ids = projectFormStore.user_ids;
  projectService.setUsers({ id: props.id, user_ids }).finally(() => {
    emit("update");
    hide();
  });
}
</script>
