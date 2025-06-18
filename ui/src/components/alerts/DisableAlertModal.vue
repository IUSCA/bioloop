<template>
  <va-modal
    v-model="visible"
    :title="'Disable Alert'"
    @ok="confirm"
    @cancel="cancel"
  >
    <p>
      Are you sure you want to disable alert
      <strong class="alert-label">{{ currentAlert?.label }}</strong
      >?
    </p>
  </va-modal>
</template>

<script setup>
const visible = ref(false);
const currentAlert = ref(null);

const emit = defineEmits(["confirm"]);

const showModal = (alert) => {
  currentAlert.value = alert;
  visible.value = true;
};

const cancel = () => {
  visible.value = false;
};

const confirm = () => {
  emit("confirm", currentAlert.value);
  visible.value = false;
};

defineExpose({ showModal });
</script>
