<template>
  <va-modal
    class="delete-project-modal"
    v-model="visible"
    title="Delete Project?"
    no-outside-dismiss
    fixed-layout
    ok-text="Delete"
    @ok="handleOk"
    @cancel="hide"
  >
    <va-inner-loading :loading="loading">
      <div>Are you sure you want to delete {{ props.data.name }}?</div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import projectService from "@/services/projects";

const props = defineProps(["data"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const visible = ref(false);
const loading = ref(false);

function hide() {
  loading.value = false;
  visible.value = false;
}

function show() {
  visible.value = true;
}

function handleOk() {
  loading.value = true;
  const id = props.data.id;

  projectService.deleteProject(id).finally(() => {
    loading.value = false;
    hide();
    emit("update");
  });
}
</script>
