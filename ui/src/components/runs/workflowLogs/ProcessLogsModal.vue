<template>
  <va-modal
    v-model="visible"
    title="Process Logs"
    fixed-layout
    close-button
    hideDefaultActions
    size="large"
    @close="hide"
  >
    <div class="sm:h-[75vh] sm:w-[60vw]">
      <WorkflowLogs v-if="processId" :process-id="processId" :key="processId" />
    </div>
  </va-modal>
</template>

<script setup>
// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const visible = ref(false);
const processId = ref(null);

function hide() {
  visible.value = false;
}

function show(id) {
  visible.value = true;
  processId.value = id;
}
</script>
