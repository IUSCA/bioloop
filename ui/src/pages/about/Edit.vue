<template>
  <!--  <div class="min-h-96 h-full">-->
  <va-textarea
    class="w-full h-full"
    v-model="input"
    :rules="[(v) => (v && v.length > 0) || 'Required']"
  ></va-textarea>
  <!--  </div>-->
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
    emit("update:modelValue", value);
  },
});

// const updatedText = ref("");
</script>

<style scoped>
.va-textarea * {
  height: 100%;
}
</style>
