<template>
  <va-modal
    v-model="visible"
    title="Alert Details"
    hide-default-actions
    close-button
    size="medium"
    @cancel="hideModal"
  >
    <div v-if="alertData" class="flex flex-col gap-6">
      <Alert 
        :alert="alertData" 
        :dismissable="false"
      />
    </div>
  </va-modal>
</template>

<script setup>
const alertData = ref(null);

const visible = ref(false);

const show = (alert) => {
  alertData.value = alert;
  visible.value = true;
};

const hideModal = () => {
  visible.value = false;
  alertData.value = null;
};

defineExpose({ show });
</script>

