<template>
  <div class="flex items-center gap-3">
    <!-- TODO later: make this a slot -->
    <VaInput v-if="editing" v-model="model" />
    <span class="min-w-12" v-else> {{ model }} </span>

    <VaButton
      v-if="!editing"
      preset="secondary"
      color="primary"
      @click="editing = true"
      size="small"
    >
      <i-mdi-pencil />
    </VaButton>

    <div v-else>
      <VaButton
        preset="secondary"
        color="success"
        @click="
          editing = false;
          emit('update:modelValue', model);
        "
      >
        <i-mdi-check />
      </VaButton>

      <VaButton preset="secondary" color="secondary" @click="editing = false">
        <i-mdi-close />
      </VaButton>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: String,
});
const emit = defineEmits(["update:modelValue"]);

const model = ref(props.modelValue);
watch(
  () => props.modelValue,
  (newVal) => {
    model.value = newVal;
  },
);

const editing = ref(false);
</script>
