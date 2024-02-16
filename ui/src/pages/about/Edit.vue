<template>
  <va-textarea
    v-model="input"
    class="w-full"
    :rules="[(v) => (v && v.length > 0) || 'Required']"
    :resize="false"
  ></va-textarea>
</template>

<script setup>
const props = {
  modelValue: {
    type: String,
    required: true,
  },
};

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
