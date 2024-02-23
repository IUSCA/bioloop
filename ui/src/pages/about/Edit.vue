<template>
  <va-textarea
    placeholder="Markdown supported"
    :label="_showLabel ? 'Updated text' : ''"
    v-model="input"
    class="w-full"
    :rules="[(v) => (v && v.length > 0) || 'Required']"
    :resize="false"
  ></va-textarea>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  showLabel: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["update:modelValue"]);

const _showLabel = toRef(() => props.showLabel);

const input = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit("update:modelValue", value);
  },
});
</script>

<style scoped>
.va-textarea {
  height: 450px;
}
</style>
