<template>
  <va-modal
    title="Create Genome Browser Session"
    v-model="visible"
    fixed-layout
    hide-default-actions
    size="small"
    okText="Create"
    @ok="
        emit('ok');
      "
    @cancel="
        emit('cancel');
      "
  >

  </va-modal>
</template>

<script setup>
const props = defineProps({
  tracks: { type: Array, required: true },
})

const emit = defineEmits(['ok', 'cancel'])

const visible = ref(false);

function hide() {
  visible.value = false;
}

function show() {
  // update form with current filters
  // form.value = { ...filters.value };
  visible.value = true;
}

function handleSearch() {
  // filters.value = { ...form.value };
  hide();
  emit("ok");
}

// function handleReset() {
//   form.value = store.defaultFilters();
// }

</script>


<style scoped>

</style>
