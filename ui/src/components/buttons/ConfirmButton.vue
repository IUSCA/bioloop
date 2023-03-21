<template>
  <div>
    <va-button
      v-if="!showConfirmAction"
      @click="showConfirmTemporarily"
      :color="props.color"
      preset="primary"
    >
      <Icon :icon="props.icon" class="mr-3" />
      <span>{{ props.action }}</span>
    </va-button>

    <va-button
      v-if="showConfirmAction"
      @click="emit('click')"
      :color="props.color"
    >
      <Icon icon="mdi-alert-circle-outline" class="mr-3" />
      <span> Click again to confirm </span>
    </va-button>
  </div>
</template>

<script setup>
const props = defineProps({
  icon: String,
  action: String,
  color: String,
});

const emit = defineEmits(["click"]);

const showConfirmAction = ref(false);

function showConfirmTemporarily() {
  showConfirmAction.value = true;
  setTimeout(() => (showConfirmAction.value = false), 3000);
}
</script>
