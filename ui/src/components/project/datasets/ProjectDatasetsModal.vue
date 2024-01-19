<template>
  <va-modal
    v-model="visible"
    title="Manage Access"
    no-outside-dismiss
    @ok="handleOk"
    @close="hide"
    :size="modalSize"
  >
    <va-inner-loading
      :loading="loading"
      class="min-w-full sm:min-h-[50vh] sm:max-h-[65vh]"
    >
      <ProjectDatasetsForm />
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import projectService from "@/services/projects";
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { useBreakpoint } from "vuestic-ui";

const breakpoint = useBreakpoint();

const props = defineProps(["id"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const modalSize = computed(() => {
  if (breakpoint.xs || breakpoint.sm) {
    return "medium";
  }
  return "large";
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
  const dataset_ids = projectFormStore.dataset_ids;
  projectService.setDatasets({ id: props.id, dataset_ids }).finally(() => {
    emit("update");
    hide();
  });
}
</script>
