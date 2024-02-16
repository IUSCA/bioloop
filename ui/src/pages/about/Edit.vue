<template>
  <va-textarea
    :label="label"
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

const _showLabel = toRef(() => props.showLabel);
watch(_showLabel, (val) => {
  console.log(`watch`);
  console.log(`showLabel:`);
  console.log(val);
});

onMounted(() => {
  console.log(`mounted`);
  console.log(`showLabel:`);
  console.log(_showLabel.value);
});

const label = computed(() => {
  console.log(`computed`);
  console.log(`showLabel:`);
  console.log(_showLabel.value);
  return _showLabel.value ? "Markdown" : "";
});

const emit = defineEmits(["update:modelValue"]);

const input = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    // console.log(`set():`);
    // console.log(`emitting:`);
    // console.log(value);
    emit("update:modelValue", value);
  },
});

// const updatedText = ref("");
</script>

<style scoped>
.va-textarea {
  height: 500px;
}
</style>
