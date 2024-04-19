<template>
  <va-input
    :label="props.label || 'Dataset Name'"
    :placeholder="props.placeholder || 'Dataset Name'"
    v-model="_modelValue"
    :rules="props.rules"
  />
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  rules: {
    type: Array,
    required: false,
  },
  label: {
    type: String,
    required: false,
  },
  placeholder: {
    type: String,
    required: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

const _modelValue = computed({
  get() {
    return props.modelValue;
  },
  set(newValue) {
    emit("update:modelValue", newValue);
  },
});
</script>

<style scoped></style>
