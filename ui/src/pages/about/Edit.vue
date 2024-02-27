<template>
  <va-textarea
    placeholder="Use <br> for adding empty lines"
    :label="props.showLabel ? props.label : ''"
    v-model="input"
    class="w-full"
    :class="[props.showLabel ? 'textarea--labelled' : 'textarea--unlabelled']"
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
  label: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue"]);

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
.textarea--labelled {
  height: 450px;
}

.textarea--unlabelled {
  height: 418px;
}
</style>
