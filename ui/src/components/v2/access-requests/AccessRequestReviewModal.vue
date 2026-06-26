<template>
  <div>Review Modal Stub</div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  request: {
    type: Object,
    default: null,
  },
});

defineEmits(["update:modelValue"]);
</script>
